import WebSocket from "ws";
import {
  EMPTY_KEYS,
  FIXED_STEP,
  createInputState,
  freshRun,
  pickUpgradeChoices,
  updateGame,
  type FighterId,
  type GameState,
  type PlayerInputState,
  type Result,
  type Upgrade,
} from "../../lib/game-core.ts";
import {
  BUILD_ID,
  PROTOCOL_VERSION,
  type CityId,
  type ClientMessage,
  type Identity,
  type InitialMessage,
  type RoomPhase,
  type SafeUpgrade,
  parseJsonMessage,
  readClientMessage,
} from "./protocol.ts";
import { capabilityMatches, hashCapability, randomCapability, signMatchReceipt } from "./security.ts";

const LOBBY_TTL_MS = 10 * 60 * 1000;
const MATCH_TTL_MS = 60 * 60 * 1000;
const RECONNECT_GRACE_MS = 30_000;
const INPUT_STALE_MS = 250;
const CONTROL_BUFFER_LIMIT = 256 * 1024;
const SNAPSHOT_BUFFER_LIMIT = 64 * 1024;
const SNAPSHOT_EVERY_TICKS = 3;
const MAX_ROOMS = 256;
const MAX_ROOMS_PER_IP = 8;
const MAX_MESSAGES_PER_SECOND = 120;

type PlayerSession = {
  id: FighterId;
  identity: Identity;
  resumeTokenHash: Buffer;
  socket: WebSocket | null;
  ip: string;
  connected: boolean;
  disconnectedAt: number | null;
  lastMessageAt: number;
  lastPongAt: number;
  lastInputAt: number;
  lastInputSeq: number;
  lastInputSentAt: number;
  messageWindowStartedAt: number;
  messageCount: number;
  input: PlayerInputState;
};

type Room = {
  id: string;
  createdAt: number;
  expiresAt: number;
  phase: RoomPhase;
  city: CityId;
  inviteTokenHash: Buffer | null;
  host: PlayerSession;
  guest: PlayerSession | null;
  state: GameState | null;
  tick: number;
  snapshotSeq: number;
  upgradeChoices: Upgrade[];
  finalResult: Result | null;
  resultReceipt: string | null;
  endedAt: number | null;
};

type SocketContext = { room: Room; player: PlayerSession };

export type RoomManagerStats = {
  rooms: number;
  matches: number;
  players: number;
};

function safeUpgrade(upgrade: Upgrade): SafeUpgrade {
  return { id: upgrade.id, name: upgrade.name, description: upgrade.description };
}

function roomPlayers(room: Room) {
  return [room.host, room.guest].filter((player): player is PlayerSession => Boolean(player)).map((player) => ({
    id: player.id,
    name: player.identity.name,
    pantId: player.identity.pantId,
    connected: player.connected,
  }));
}

function makeSession(id: FighterId, identity: Identity, resumeToken: string, socket: WebSocket, ip: string): PlayerSession {
  const now = Date.now();
  return {
    id,
    identity,
    resumeTokenHash: hashCapability(resumeToken),
    socket,
    ip,
    connected: true,
    disconnectedAt: null,
    lastMessageAt: now,
    lastPongAt: now,
    lastInputAt: now,
    lastInputSeq: 0,
    lastInputSentAt: 0,
    messageWindowStartedAt: now,
    messageCount: 0,
    input: createInputState(),
  };
}

export class RoomManager {
  private readonly rooms = new Map<string, Room>();
  private readonly sockets = new WeakMap<WebSocket, SocketContext>();
  private readonly matchTicketSecret: string;
  private pingNonce = 0;

  constructor(matchTicketSecret: string) {
    this.matchTicketSecret = matchTicketSecret;
  }

  getStats(): RoomManagerStats {
    let matches = 0;
    let players = 0;
    for (const room of this.rooms.values()) {
      if (room.state && (room.phase === "playing" || room.phase === "upgrade")) matches += 1;
      if (room.host.connected) players += 1;
      if (room.guest?.connected) players += 1;
    }
    return { rooms: this.rooms.size, matches, players };
  }

  accept(socket: WebSocket, ip: string, initial: InitialMessage): boolean {
    if (initial.type === "create") return this.createRoom(socket, ip, initial.identity);
    if (initial.type === "join") return this.joinRoom(socket, ip, initial.roomId, initial.inviteToken, initial.identity);
    return this.resumeRoom(socket, ip, initial.roomId, initial.playerId, initial.resumeToken);
  }

  tick(dt = FIXED_STEP): void {
    const now = Date.now();
    for (const room of this.rooms.values()) {
      if (room.expiresAt <= now || (room.endedAt !== null && room.endedAt + 120_000 <= now)) {
        this.closeRoom(room, 1000, "Room expired");
        continue;
      }
      const guest = room.guest;
      if (room.state && guest && (!room.host.connected || !guest.connected)) {
        const disconnectedAt = Math.min(
          room.host.disconnectedAt ?? Number.POSITIVE_INFINITY,
          guest.disconnectedAt ?? Number.POSITIVE_INFINITY,
        );
        if (Number.isFinite(disconnectedAt) && now - disconnectedAt > RECONNECT_GRACE_MS) {
          this.closeRoom(room, 4004, "Reconnect window expired");
        }
        continue;
      }
      if (room.phase !== "playing" || !room.state || !guest) continue;

      this.zeroStaleInput(room.host, now);
      this.zeroStaleInput(guest, now);
      updateGame(room.state, dt, EMPTY_KEYS, room.host.input, guest.input);
      room.tick += 1;

      if (room.state.pendingUpgrade) {
        room.phase = "upgrade";
        room.upgradeChoices = pickUpgradeChoices(room.state.player);
        this.broadcast(room, {
          type: "screen",
          screen: "upgrade",
          choices: room.upgradeChoices.map(safeUpgrade),
          tick: room.tick,
        });
        this.broadcastSnapshot(room, true);
        continue;
      }

      if (room.state.players.every((fighter) => fighter.hp <= 0) && room.state.gameOverTimer <= 0) {
        this.finishMatch(room);
        continue;
      }

      if (room.tick % SNAPSHOT_EVERY_TICKS === 0) this.broadcastSnapshot(room, false);
    }
  }

  heartbeat(): void {
    const now = Date.now();
    const nonce = ++this.pingNonce;
    for (const room of this.rooms.values()) {
      for (const player of [room.host, room.guest]) {
        if (!player?.connected || !player.socket) continue;
        if (now - player.lastPongAt > 15_000 || now - player.lastMessageAt > 20_000) {
          player.socket.close(4008, "Connection timed out");
          continue;
        }
        this.send(player, { type: "ping", nonce, serverTime: now }, true);
      }
    }
  }

  shutdown(): void {
    for (const room of this.rooms.values()) this.closeRoom(room, 1001, "Server restarting");
  }

  private createRoom(socket: WebSocket, ip: string, identity: Identity): boolean {
    let roomsForIp = 0;
    for (const room of this.rooms.values()) if (room.host.ip === ip) roomsForIp += 1;
    if (this.rooms.size >= MAX_ROOMS || roomsForIp >= MAX_ROOMS_PER_IP) {
      this.reject(socket, "ROOM_LIMIT", "The match server is at room capacity");
      return false;
    }
    let roomId = randomCapability(16);
    while (this.rooms.has(roomId)) roomId = randomCapability(16);
    const inviteToken = randomCapability(32);
    const resumeToken = randomCapability(32);
    const now = Date.now();
    const host = makeSession("host", identity, resumeToken, socket, ip);
    const room: Room = {
      id: roomId,
      createdAt: now,
      expiresAt: now + LOBBY_TTL_MS,
      phase: "waiting",
      city: "neon",
      inviteTokenHash: hashCapability(inviteToken),
      host,
      guest: null,
      state: null,
      tick: 0,
      snapshotSeq: 0,
      upgradeChoices: [],
      finalResult: null,
      resultReceipt: null,
      endedAt: null,
    };
    this.rooms.set(roomId, room);
    this.bindSocket(room, host, socket);
    this.send(host, {
      type: "welcome",
      protocolVersion: PROTOCOL_VERSION,
      buildId: BUILD_ID,
      roomId,
      role: "host",
      resumeToken,
      inviteToken,
      expiresAt: room.expiresAt,
    }, true);
    this.broadcastLobby(room);
    return true;
  }

  private joinRoom(socket: WebSocket, ip: string, roomId: string, inviteToken: string, identity: Identity): boolean {
    const room = this.rooms.get(roomId);
    if (!room || room.phase !== "waiting" || room.guest || !room.inviteTokenHash || !capabilityMatches(inviteToken, room.inviteTokenHash)) {
      this.reject(socket, "ROOM_UNAVAILABLE", "Room not found or invite already used");
      return false;
    }
    const resumeToken = randomCapability(32);
    const guest = makeSession("guest", identity, resumeToken, socket, ip);
    room.guest = guest;
    room.inviteTokenHash = null;
    room.phase = "ready";
    room.expiresAt = Date.now() + LOBBY_TTL_MS;
    this.bindSocket(room, guest, socket);
    this.send(guest, {
      type: "welcome",
      protocolVersion: PROTOCOL_VERSION,
      buildId: BUILD_ID,
      roomId,
      role: "guest",
      resumeToken,
      expiresAt: room.expiresAt,
    }, true);
    this.broadcastLobby(room);
    return true;
  }

  private resumeRoom(socket: WebSocket, ip: string, roomId: string, playerId: FighterId, resumeToken: string): boolean {
    const room = this.rooms.get(roomId);
    const player = room ? (playerId === "host" ? room.host : room.guest) : null;
    if (!room || !player || !capabilityMatches(resumeToken, player.resumeTokenHash)) {
      this.reject(socket, "RESUME_DENIED", "The room can no longer be resumed");
      return false;
    }
    if (player.socket && player.socket.readyState === WebSocket.OPEN) player.socket.close(4001, "Replaced by resumed connection");
    player.socket = socket;
    player.ip = ip;
    player.connected = true;
    player.disconnectedAt = null;
    player.lastMessageAt = Date.now();
    player.lastPongAt = Date.now();
    if (room.state) {
      const fighter = room.state.players.find((candidate) => candidate.id === player.id);
      if (fighter) fighter.connected = true;
    }
    this.bindSocket(room, player, socket);
    this.send(player, {
      type: "welcome",
      protocolVersion: PROTOCOL_VERSION,
      buildId: BUILD_ID,
      roomId,
      role: player.id,
      resumeToken,
      expiresAt: room.expiresAt,
      resumed: true,
    }, true);
    this.broadcastLobby(room);
    if (room.state) {
      this.send(player, { type: "started", city: room.city, tick: room.tick, state: this.networkState(room.state) }, true);
      this.sendSnapshot(player, room, true);
      if (room.phase === "upgrade") {
        this.send(player, {
          type: "screen",
          screen: "upgrade",
          choices: room.upgradeChoices.map(safeUpgrade),
          tick: room.tick,
        }, true);
      } else if (room.phase === "gameover" && room.finalResult && room.resultReceipt) {
        this.send(player, {
          type: "screen",
          screen: "gameover",
          result: room.finalResult,
          receipt: room.resultReceipt,
          tick: room.tick,
        }, true);
      }
    }
    return true;
  }

  private bindSocket(room: Room, player: PlayerSession, socket: WebSocket): void {
    this.sockets.set(socket, { room, player });
    socket.on("message", (raw, isBinary) => {
      if (isBinary) { socket.close(1003, "Text messages required"); return; }
      const context = this.sockets.get(socket);
      if (!context || context.player.socket !== socket) return;
      const now = Date.now();
      if (now - context.player.messageWindowStartedAt >= 1_000) {
        context.player.messageWindowStartedAt = now;
        context.player.messageCount = 0;
      }
      context.player.messageCount += 1;
      if (context.player.messageCount > MAX_MESSAGES_PER_SECOND) {
        socket.close(1008, "Message rate exceeded");
        return;
      }
      const parsed = parseJsonMessage(raw);
      const message = parsed ? readClientMessage(parsed) : null;
      if (!message) { socket.close(1008, "Invalid message"); return; }
      context.player.lastMessageAt = now;
      this.handleMessage(context.room, context.player, message);
    });
    socket.on("close", () => this.handleClose(socket));
    socket.on("error", () => this.handleClose(socket));
  }

  private handleMessage(room: Room, player: PlayerSession, message: ClientMessage): void {
    if (message.type === "input") {
      if (message.seq <= player.lastInputSeq) return;
      player.lastInputSeq = message.seq;
      player.lastInputSentAt = message.input.sentAt;
      player.lastInputAt = Date.now();
      player.input.dx = message.input.dx;
      player.input.dy = message.input.dy;
      player.input.attack = message.input.attack;
      player.input.revive = message.input.revive;
      return;
    }
    if (message.type === "action") {
      player.lastInputAt = Date.now();
      player.input[message.action] = true;
      return;
    }
    if (message.type === "pong") {
      player.lastPongAt = Date.now();
      return;
    }
    if (message.type === "pant") {
      if (room.phase !== "waiting" && room.phase !== "ready" && room.phase !== "gameover") {
        this.sendError(player, "PANT_LOCKED", "Pants can only be changed before a run");
        return;
      }
      player.identity.pantId = message.pantId;
      this.broadcastLobby(room);
      return;
    }
    if (message.type === "leave") {
      this.closeRoom(room, 1000, player.id === "host" ? "Room closed" : "Partner left room");
      return;
    }
    if (message.type === "start") {
      if (player.id !== "host" || (room.phase !== "ready" && room.phase !== "gameover") || !room.guest?.connected) {
        this.sendError(player, "START_DENIED", "Both fighters must be connected before launch");
        return;
      }
      this.startMatch(room, message.city);
      return;
    }
    if (message.type === "upgrade") {
      if (player.id !== "host" || room.phase !== "upgrade" || !room.state) return;
      const upgrade = room.upgradeChoices.find((candidate) => candidate.id === message.upgradeId);
      if (!upgrade) { this.sendError(player, "UPGRADE_DENIED", "That upgrade is no longer available"); return; }
      for (const fighter of room.state.players) upgrade.apply(fighter);
      room.state.pendingUpgrade = false;
      room.upgradeChoices = [];
      room.phase = "playing";
      this.broadcast(room, { type: "screen", screen: "playing", tick: room.tick, upgradeId: upgrade.id });
      this.broadcastSnapshot(room, true);
    }
  }

  private startMatch(room: Room, city: CityId): void {
    const guest = room.guest;
    if (!guest) return;
    room.city = city;
    room.state = freshRun(
      { id: "host", name: room.host.identity.name, pantId: room.host.identity.pantId },
      { id: "guest", name: guest.identity.name, pantId: guest.identity.pantId },
    );
    room.tick = 0;
    room.snapshotSeq = 0;
    room.phase = "playing";
    room.expiresAt = Date.now() + MATCH_TTL_MS;
    room.finalResult = null;
    room.resultReceipt = null;
    room.endedAt = null;
    room.host.input = createInputState();
    guest.input = createInputState();
    this.broadcast(room, { type: "started", city, tick: 0, state: this.networkState(room.state) });
  }

  private finishMatch(room: Room): void {
    const state = room.state;
    if (!state || room.phase === "gameover") return;
    room.phase = "gameover";
    room.endedAt = Date.now();
    const result: Result = {
      runId: state.runId,
      score: state.score,
      wave: state.wave,
      kills: state.kills,
      maxCombo: state.maxCombo,
      elapsed: state.elapsed,
      mode: "coop",
    };
    const receiptPayload = {
      ...result,
      roomId: room.id,
      issuedAt: Date.now(),
      playerName: room.host.identity.name,
      pantId: room.host.identity.pantId,
    };
    room.finalResult = result;
    room.resultReceipt = signMatchReceipt(this.matchTicketSecret, receiptPayload);
    this.broadcastSnapshot(room, true);
    this.broadcast(room, {
      type: "screen",
      screen: "gameover",
      result,
      receipt: room.resultReceipt,
      tick: room.tick,
    });
  }

  private zeroStaleInput(player: PlayerSession, now: number): void {
    if (now - player.lastInputAt <= INPUT_STALE_MS) return;
    player.input.dx = 0;
    player.input.dy = 0;
    player.input.attack = false;
    player.input.revive = false;
  }

  private networkState(state: GameState): Omit<GameState, "player"> & { player?: never } {
    const { player: _player, ...snapshot } = state;
    void _player;
    return {
      ...snapshot,
      effects: snapshot.effects.slice(-48),
      audioEvents: snapshot.audioEvents.slice(-24),
    };
  }

  private broadcastSnapshot(room: Room, force: boolean): void {
    const state = room.state;
    if (!state) return;
    const payload = JSON.stringify({
      type: "snapshot",
      seq: ++room.snapshotSeq,
      tick: room.tick,
      ack: {
        host: room.host.lastInputSeq,
        guest: room.guest?.lastInputSeq ?? 0,
        hostTime: room.host.lastInputSentAt,
        guestTime: room.guest?.lastInputSentAt ?? 0,
      },
      state: this.networkState(state),
    });
    for (const player of [room.host, room.guest]) {
      if (!player) continue;
      this.sendSerialized(player, payload, force, true);
    }
    state.audioEvents.length = 0;
  }

  private sendSnapshot(player: PlayerSession, room: Room, force: boolean): void {
    if (!room.state) return;
    const payload = JSON.stringify({
      type: "snapshot",
      seq: ++room.snapshotSeq,
      tick: room.tick,
      ack: {
        host: room.host.lastInputSeq,
        guest: room.guest?.lastInputSeq ?? 0,
        hostTime: room.host.lastInputSentAt,
        guestTime: room.guest?.lastInputSentAt ?? 0,
      },
      state: this.networkState(room.state),
    });
    this.sendSerialized(player, payload, force, true);
  }

  private broadcastLobby(room: Room): void {
    this.broadcast(room, {
      type: "lobby",
      roomId: room.id,
      phase: room.phase,
      leaderId: "host",
      players: roomPlayers(room),
      expiresAt: room.expiresAt,
    });
  }

  private broadcast(room: Room, message: Record<string, unknown>): void {
    const payload = JSON.stringify(message);
    for (const player of [room.host, room.guest]) {
      if (player) this.sendSerialized(player, payload, true, false);
    }
  }

  private send(player: PlayerSession, message: Record<string, unknown>, important: boolean): boolean {
    return this.sendSerialized(player, JSON.stringify(message), important, false);
  }

  private sendSerialized(player: PlayerSession, payload: string, important: boolean, snapshot: boolean): boolean {
    const socket = player.socket;
    if (!player.connected || !socket || socket.readyState !== WebSocket.OPEN) return false;
    const limit = snapshot ? SNAPSHOT_BUFFER_LIMIT : CONTROL_BUFFER_LIMIT;
    if (socket.bufferedAmount > limit) {
      if (!important || snapshot) return false;
      socket.close(1013, "Connection is too far behind");
      return false;
    }
    try { socket.send(payload); return true; } catch { return false; }
  }

  private sendError(player: PlayerSession, code: string, message: string): void {
    this.send(player, { type: "error", code, message, retryable: false }, true);
  }

  private reject(socket: WebSocket, code: string, message: string): void {
    try { socket.send(JSON.stringify({ type: "error", code, message, retryable: false })); } catch { /* no-op */ }
    socket.close(1008, message.slice(0, 100));
  }

  private handleClose(socket: WebSocket): void {
    const context = this.sockets.get(socket);
    if (!context || context.player.socket !== socket) return;
    context.player.socket = null;
    context.player.connected = false;
    context.player.disconnectedAt = Date.now();
    context.player.input = createInputState();
    if (context.room.state) {
      const fighter = context.room.state.players.find((candidate) => candidate.id === context.player.id);
      if (fighter) fighter.connected = false;
    }
    this.broadcastLobby(context.room);
  }

  private closeRoom(room: Room, code: number, reason: string): void {
    if (!this.rooms.delete(room.id)) return;
    for (const player of [room.host, room.guest]) {
      if (player?.socket && player.socket.readyState < WebSocket.CLOSING) player.socket.close(code, reason.slice(0, 100));
    }
  }
}
