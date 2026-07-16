import { PANT_IDS, type PantId } from "./game-config";

export const COOP_PROTOCOL_VERSION = 2;
export const COOP_BUILD_ID = "camo-clash-server-2";
export const COOP_WEBSOCKET_PROTOCOL = "camo-clash.v2";

export type CoopRole = "host" | "guest";
export type CoopConnectionStatus = "waiting" | "connecting" | "connected" | "closed";
export type CoopMessage = Record<string, unknown>;
export type CoopIdentity = { name: string; pantId: PantId };

export type CoopInvite = {
  roomId: string;
  inviteToken: string;
};

export type CoopConnectionHandlers = {
  onOpen?: () => void;
  onControl?: (message: CoopMessage) => void;
  onState?: (message: CoopMessage) => void;
  onStatus?: (status: CoopConnectionStatus) => void;
  onError?: (message: string) => void;
  onClose?: () => void;
};

export type DedicatedInput = {
  dx: number;
  dy: number;
  attack?: boolean;
};

type ConnectionMode = "create" | "join" | "resume";
type CityId = "neon" | "harbor" | "blackout";
type RosterPlayer = CoopIdentity & { id: CoopRole; connected: boolean };

type WelcomeMessage = {
  type: "welcome";
  roomId: string;
  role: CoopRole;
  inviteToken?: string;
  resumeToken: string;
  expiresAt: number;
  resumed: boolean;
};

type LobbyMessage = {
  type: "lobby";
  roomId: string;
  leaderId: CoopRole;
  phase: "waiting" | "ready" | "playing" | "upgrade" | "gameover";
  players: RosterPlayer[];
  expiresAt: number;
};

type StartedMessage = {
  type: "started";
  city: CityId;
  tick: number;
  state: CoopMessage;
};

type SnapshotMessage = {
  type: "snapshot";
  seq: number;
  tick: number;
  ack: Record<CoopRole, number>;
  state: CoopMessage;
};

type SafeUpgrade = { id: string; name: string; description: string };

type ScreenMessage = {
  type: "screen";
  screen: "upgrade" | "playing" | "gameover";
  tick: number;
  choices?: SafeUpgrade[];
  upgradeId?: string;
  result?: CoopMessage;
  receipt?: string;
};

type PingMessage = {
  type: "ping";
  nonce: string | number;
};

type ErrorMessage = {
  type: "error";
  code: string;
  message: string;
  retryable: boolean;
};

type ServerMessage =
  | WelcomeMessage
  | LobbyMessage
  | StartedMessage
  | SnapshotMessage
  | ScreenMessage
  | PingMessage
  | ErrorMessage;

const ROOM_ID_PATTERN = /^[A-Za-z0-9_-]{22}$/;
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;
const ERROR_CODE_PATTERN = /^[A-Z0-9_]{1,48}$/;
const UPGRADE_IDS = new Set(["hands", "stitch", "feet", "thread", "reach", "wind"]);
const CITY_IDS = new Set<CityId>(["neon", "harbor", "blackout"]);
const VALID_PANTS = new Set<string>(PANT_IDS);
const INPUT_ACTIONS = new Set(["attackQueued", "dash", "ability", "swap", "reload"]);

const ACTIVE_WELCOME_TIMEOUT_MS = 10_000;
const COLD_START_WELCOME_TIMEOUT_MS = 75_000;
const RECONNECT_GRACE_MS = 28_000;
const RECONNECT_DELAYS_MS = [250, 500, 1_000, 2_000, 3_000];
const STATE_BUFFER_LIMIT = 16 * 1024;
const CONTROL_BUFFER_LIMIT = 64 * 1024;
const HARD_BUFFER_LIMIT = 256 * 1024;
const HARD_BUFFER_TIMEOUT_MS = 2_000;
const MAX_AUTH_MESSAGE_BYTES = 2 * 1024;
const MAX_INPUT_MESSAGE_BYTES = 512;
const MAX_CONTROL_MESSAGE_BYTES = 2 * 1024;
const MAX_SERVER_MESSAGE_BYTES = 256 * 1024;
const MAX_ENEMIES = 64;
const MAX_PROJECTILES = 192;
const MAX_PICKUPS = 8;
const MAX_EFFECTS = 128;
const MAX_AUDIO_EVENTS = 32;
const encoder = new TextEncoder();

function isRecord(value: unknown): value is CoopMessage {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isSafeCounter(value: unknown) {
  return Number.isSafeInteger(value) && (value as number) >= 0 && (value as number) <= 2_147_483_647;
}

function isFiniteNumber(value: unknown, min = -Number.MAX_VALUE, max = Number.MAX_VALUE) {
  return typeof value === "number" && Number.isFinite(value) && value >= min && value <= max;
}

function isPantId(value: unknown): value is PantId {
  return typeof value === "string" && VALID_PANTS.has(value);
}

function isRole(value: unknown): value is CoopRole {
  return value === "host" || value === "guest";
}

function isCityId(value: unknown): value is CityId {
  return typeof value === "string" && CITY_IDS.has(value as CityId);
}

function byteLength(value: string) {
  return encoder.encode(value).byteLength;
}

function normalizedIdentity(identity: CoopIdentity | undefined, role: CoopRole): CoopIdentity {
  const fallback = role === "host" ? "FIGHTER 01" : "FIGHTER 02";
  const rawName = typeof identity?.name === "string" ? identity.name : fallback;
  const name = rawName.normalize("NFKC").trim().replace(/\s+/g, " ").slice(0, 18) || fallback;
  return {
    name,
    pantId: isPantId(identity?.pantId) ? identity.pantId : "ghost",
  };
}

function normalizeInviteText(input: string) {
  const trimmed = input.trim();
  if (!trimmed) return "";
  try {
    const base = typeof window === "undefined" ? "https://localhost/" : window.location.href;
    const url = new URL(trimmed, base);
    return url.hash.startsWith("#coop=") ? url.hash.slice(6) : trimmed.replace(/^#coop=/, "");
  } catch {
    return trimmed.replace(/^#coop=/, "");
  }
}

export function parseCoopInvite(input: string): CoopInvite | null {
  const normalized = normalizeInviteText(input);
  const separator = normalized.indexOf(".");
  if (separator < 0) return null;
  const roomId = normalized.slice(0, separator);
  const inviteToken = normalized.slice(separator + 1);
  if (!ROOM_ID_PATTERN.test(roomId) || !TOKEN_PATTERN.test(inviteToken)) return null;
  return { roomId, inviteToken };
}

export function buildCoopInviteUrl(roomId: string, inviteToken: string) {
  if (!ROOM_ID_PATTERN.test(roomId) || !TOKEN_PATTERN.test(inviteToken)) return "";
  if (typeof window === "undefined") return `#coop=${roomId}.${inviteToken}`;
  return `${window.location.origin}${window.location.pathname}#coop=${roomId}.${inviteToken}`;
}

function isLoopback(hostname: string) {
  const normalized = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  return normalized === "localhost" || normalized === "127.0.0.1" || normalized === "::1";
}

function resolveServerUrl() {
  if (typeof window === "undefined") {
    throw new Error("Online co-op can only connect from a browser.");
  }

  const configured = process.env.NEXT_PUBLIC_COOP_SERVER_URL?.trim();
  const raw = configured || (isLoopback(window.location.hostname) ? "ws://localhost:3002/v2" : "");
  if (!raw) throw new Error("The dedicated co-op server is not configured.");

  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error("The dedicated co-op server URL is invalid.");
  }

  if (url.username || url.password || url.search || url.hash) {
    throw new Error("The dedicated co-op server URL must not contain credentials or query data.");
  }
  if (url.protocol !== "wss:" && url.protocol !== "ws:") {
    throw new Error("The dedicated co-op server must use WebSocket transport.");
  }
  if (url.protocol === "ws:" && (!isLoopback(url.hostname) || !isLoopback(window.location.hostname))) {
    throw new Error("An encrypted wss:// co-op server is required outside local development.");
  }
  return url.toString();
}

function readRosterPlayer(value: unknown): RosterPlayer | null {
  if (!isRecord(value) || !isRole(value.id) || !isPantId(value.pantId) || typeof value.connected !== "boolean") return null;
  if (typeof value.name !== "string" || value.name.length < 1 || Array.from(value.name).length > 18 || byteLength(value.name) > 72) return null;
  return { id: value.id, name: value.name, pantId: value.pantId, connected: value.connected };
}

function isRenderablePlayer(value: unknown) {
  return isRecord(value)
    && isRole(value.id)
    && isPantId(value.pantId)
    && typeof value.name === "string"
    && isFiniteNumber(value.x, -256, 1_536)
    && isFiniteNumber(value.y, -256, 976)
    && isFiniteNumber(value.hp, 0, 100_000)
    && isFiniteNumber(value.maxHp, 1, 100_000)
    && isRecord(value.weapon);
}

function isRenderableEnemy(value: unknown) {
  return isRecord(value)
    && isSafeCounter(value.id)
    && typeof value.kind === "string"
    && value.kind.length <= 16
    && isFiniteNumber(value.x, -512, 1_792)
    && isFiniteNumber(value.y, -512, 1_232)
    && isFiniteNumber(value.hp, -100_000, 100_000);
}

function isRenderableProjectile(value: unknown) {
  return isRecord(value)
    && isSafeCounter(value.id)
    && typeof value.kind === "string"
    && value.kind.length <= 16
    && isFiniteNumber(value.x, -2_048, 3_328)
    && isFiniteNumber(value.y, -2_048, 2_768);
}

function isRenderablePickup(value: unknown) {
  return isRecord(value)
    && isSafeCounter(value.id)
    && isFiniteNumber(value.x, -256, 1_536)
    && isFiniteNumber(value.y, -256, 976)
    && isRecord(value.weapon);
}

function isCoopGameState(value: unknown): value is CoopMessage {
  if (!isRecord(value) || value.mode !== "coop") return false;
  if (typeof value.runId !== "string" || value.runId.length < 1 || value.runId.length > 80) return false;
  if (!Number.isInteger(value.wave) || (value.wave as number) < 1 || (value.wave as number) > 9_999) return false;
  if (!isFiniteNumber(value.score, 0, 1_000_000_000)) return false;
  if (!Array.isArray(value.players) || value.players.length !== 2 || !value.players.every(isRenderablePlayer)) return false;
  const playerIds = new Set(value.players.map((player) => (player as CoopMessage).id));
  if (!playerIds.has("host") || !playerIds.has("guest")) return false;
  if (value.player !== undefined && !isRenderablePlayer(value.player)) return false;
  if (!Array.isArray(value.enemies) || value.enemies.length > MAX_ENEMIES || !value.enemies.every(isRenderableEnemy)) return false;
  if (!Array.isArray(value.projectiles) || value.projectiles.length > MAX_PROJECTILES || !value.projectiles.every(isRenderableProjectile)) return false;
  if (!Array.isArray(value.pickups) || value.pickups.length > MAX_PICKUPS || !value.pickups.every(isRenderablePickup)) return false;
  if (!Array.isArray(value.effects) || value.effects.length > MAX_EFFECTS || !value.effects.every(isRecord)) return false;
  if (!Array.isArray(value.audioEvents) || value.audioEvents.length > MAX_AUDIO_EVENTS || !value.audioEvents.every(isRecord)) return false;
  return true;
}

function hydrateCoopGameState(value: CoopMessage) {
  const players = value.players as CoopMessage[];
  const host = players.find((player) => player.id === "host");
  return host ? { ...value, player: host } : value;
}

function isResult(value: unknown): value is CoopMessage {
  if (!isRecord(value) || value.mode !== "coop" || typeof value.runId !== "string" || value.runId.length > 80) return false;
  return isFiniteNumber(value.score, 0, 1_000_000_000)
    && isFiniteNumber(value.wave, 1, 9_999)
    && isFiniteNumber(value.kills, 0, 10_000_000)
    && isFiniteNumber(value.maxCombo, 0, 10_000_000)
    && isFiniteNumber(value.elapsed, 0, 86_400);
}

function readWelcome(value: CoopMessage): WelcomeMessage | null {
  if (!ROOM_ID_PATTERN.test(typeof value.roomId === "string" ? value.roomId : "")) return null;
  if (!isRole(value.role)) return null;
  if (!TOKEN_PATTERN.test(typeof value.resumeToken === "string" ? value.resumeToken : "")) return null;
  if (!Number.isSafeInteger(value.expiresAt) || (value.expiresAt as number) <= 0) return null;
  if (value.inviteToken !== undefined && !TOKEN_PATTERN.test(typeof value.inviteToken === "string" ? value.inviteToken : "")) return null;
  if (value.protocolVersion !== COOP_PROTOCOL_VERSION || value.buildId !== COOP_BUILD_ID) return null;
  if (value.resumed !== undefined && typeof value.resumed !== "boolean") return null;
  return {
    type: "welcome",
    roomId: value.roomId as string,
    role: value.role,
    inviteToken: value.inviteToken as string | undefined,
    resumeToken: value.resumeToken as string,
    expiresAt: value.expiresAt as number,
    resumed: value.resumed === true,
  };
}

function readLobby(value: CoopMessage): LobbyMessage | null {
  if (!ROOM_ID_PATTERN.test(typeof value.roomId === "string" ? value.roomId : "") || !isRole(value.leaderId)) return null;
  if (value.phase !== "waiting" && value.phase !== "ready" && value.phase !== "playing" && value.phase !== "upgrade" && value.phase !== "gameover") return null;
  if (!Number.isSafeInteger(value.expiresAt) || (value.expiresAt as number) <= 0) return null;
  if (!Array.isArray(value.players) || value.players.length < 1 || value.players.length > 2) return null;
  const players: RosterPlayer[] = [];
  for (const candidate of value.players) {
    const player = readRosterPlayer(candidate);
    if (!player || players.some((item) => item.id === player.id)) return null;
    players.push(player);
  }
  return {
    type: "lobby",
    roomId: value.roomId as string,
    leaderId: value.leaderId,
    phase: value.phase,
    players,
    expiresAt: value.expiresAt as number,
  };
}

function readStarted(value: CoopMessage): StartedMessage | null {
  if (!isCityId(value.city) || !isSafeCounter(value.tick) || !isCoopGameState(value.state)) return null;
  return { type: "started", city: value.city, tick: value.tick as number, state: hydrateCoopGameState(value.state) };
}

function readSnapshot(value: CoopMessage): SnapshotMessage | null {
  if (!isSafeCounter(value.seq) || !isSafeCounter(value.tick) || !isRecord(value.ack)) return null;
  if (!isSafeCounter(value.ack.host) || !isSafeCounter(value.ack.guest)) return null;
  if (!isCoopGameState(value.state)) return null;
  return {
    type: "snapshot",
    seq: value.seq as number,
    tick: value.tick as number,
    ack: { host: value.ack.host as number, guest: value.ack.guest as number },
    state: hydrateCoopGameState(value.state),
  };
}

function readSafeUpgrade(value: unknown): SafeUpgrade | null {
  if (!isRecord(value) || typeof value.id !== "string" || !UPGRADE_IDS.has(value.id)) return null;
  if (typeof value.name !== "string" || value.name.length < 1 || value.name.length > 64) return null;
  if (typeof value.description !== "string" || value.description.length < 1 || value.description.length > 160) return null;
  return { id: value.id, name: value.name, description: value.description };
}

function readScreen(value: CoopMessage): ScreenMessage | null {
  if (!isSafeCounter(value.tick)) return null;
  if (value.screen === "upgrade") {
    if (!Array.isArray(value.choices) || value.choices.length < 1 || value.choices.length > 3) return null;
    const choices: SafeUpgrade[] = [];
    for (const candidate of value.choices) {
      const choice = readSafeUpgrade(candidate);
      if (!choice || choices.some((item) => item.id === choice.id)) return null;
      choices.push(choice);
    }
    return { type: "screen", screen: "upgrade", tick: value.tick as number, choices };
  }
  if (value.screen === "playing") {
    if (value.upgradeId !== undefined && (typeof value.upgradeId !== "string" || !UPGRADE_IDS.has(value.upgradeId))) return null;
    return { type: "screen", screen: "playing", tick: value.tick as number, upgradeId: value.upgradeId as string | undefined };
  }
  if (value.screen === "gameover") {
    if (!isResult(value.result) || typeof value.receipt !== "string" || value.receipt.length < 1 || value.receipt.length > 2_048) return null;
    return { type: "screen", screen: "gameover", tick: value.tick as number, result: value.result, receipt: value.receipt };
  }
  return null;
}

function isNonce(value: unknown): value is string | number {
  return isSafeCounter(value) || (typeof value === "string" && value.length >= 1 && value.length <= 64);
}

function readPing(value: CoopMessage): PingMessage | null {
  return isNonce(value.nonce) ? { type: "ping", nonce: value.nonce } : null;
}

function readError(value: CoopMessage): ErrorMessage | null {
  if (typeof value.code !== "string" || !ERROR_CODE_PATTERN.test(value.code)) return null;
  if (typeof value.message !== "string" || value.message.length < 1 || value.message.length > 240 || byteLength(value.message) > 960) return null;
  if (value.retryable !== undefined && typeof value.retryable !== "boolean") return null;
  return {
    type: "error",
    code: value.code,
    message: value.message,
    retryable: value.retryable === true,
  };
}

function readServerMessage(raw: string): ServerMessage | null {
  if (byteLength(raw) > MAX_SERVER_MESSAGE_BYTES) return null;
  let value: unknown;
  try {
    value = JSON.parse(raw) as unknown;
  } catch {
    return null;
  }
  if (!isRecord(value) || typeof value.type !== "string") return null;
  switch (value.type) {
    case "welcome": return readWelcome(value);
    case "lobby": return readLobby(value);
    case "started": return readStarted(value);
    case "snapshot": return readSnapshot(value);
    case "screen": return readScreen(value);
    case "ping": return readPing(value);
    case "error": return readError(value);
    default: return null;
  }
}

function closeMessage(code: number, fallback: string) {
  if (code === 1008 || (code >= 4001 && code <= 4005)) return "The co-op session was rejected or expired.";
  if (code === 1013) return "The dedicated co-op server is busy. Reconnecting…";
  return fallback;
}

function shouldReconnect(code: number) {
  return code !== 1000 && code !== 1008 && !(code >= 4001 && code <= 4005);
}

export class CoopConnection {
  private readonly requestedRole: CoopRole;
  private readonly handlers: CoopConnectionHandlers;
  private readonly identity: CoopIdentity;
  private roomIdValue: string;
  private inviteTokenValue: string;
  private initialCredential: string;
  private resumeToken = "";
  private expiresAtValue: number;
  private leaderId: CoopRole = "host";
  private socket: WebSocket | null = null;
  private startPromise: Promise<void> | null = null;
  private resolveInitial: (() => void) | null = null;
  private rejectInitial: ((cause: Error) => void) | null = null;
  private welcomeTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectDeadline = 0;
  private reconnectAttempt = 0;
  private generation = 0;
  private awaitingWelcome = false;
  private welcomed = false;
  private partnerOpened = false;
  private intentionalClose = false;
  private terminal = false;
  private inputSeq = 0;
  private lastSnapshotSeq = 0;
  private lastServerTick = 0;
  private latestDx = 0;
  private latestDy = 0;
  private latestAttack = false;
  private highBufferSince = 0;
  private roster: RosterPlayer[] = [];

  constructor(
    role: CoopRole,
    roomId: string,
    token: string,
    expiresAt: number,
    handlers: CoopConnectionHandlers,
    identity?: CoopIdentity,
  ) {
    this.requestedRole = role;
    this.roomIdValue = roomId;
    this.inviteTokenValue = role === "guest" ? "" : token;
    this.initialCredential = token;
    this.expiresAtValue = expiresAt;
    this.handlers = handlers;
    this.identity = normalizedIdentity(identity, role);
  }

  get role() {
    return this.requestedRole;
  }

  get roomId() {
    return this.roomIdValue;
  }

  get expiresAt() {
    return this.expiresAtValue;
  }

  get inviteToken() {
    return this.inviteTokenValue;
  }

  start() {
    if (this.startPromise) return this.startPromise;
    this.startPromise = new Promise<void>((resolve, reject) => {
      this.resolveInitial = resolve;
      this.rejectInitial = reject;
      if (typeof WebSocket === "undefined") {
        this.rejectInitialConnection("This browser does not support online co-op.");
        return;
      }
      if (this.requestedRole === "guest" && (!ROOM_ID_PATTERN.test(this.roomIdValue) || !TOKEN_PATTERN.test(this.initialCredential))) {
        this.rejectInitialConnection("The private co-op invite is invalid.");
        return;
      }
      this.openSocket(this.requestedRole === "host" ? "create" : "join");
    });
    return this.startPromise;
  }

  sendState(message: CoopMessage) {
    if (message.type !== "input" || !isRecord(message.input)) return false;
    const dx = isFiniteNumber(message.input.dx, -1, 1) ? message.input.dx as number : 0;
    const dy = isFiniteNumber(message.input.dy, -1, 1) ? message.input.dy as number : 0;
    return this.sendInput({ dx, dy, attack: message.input.attack === true });
  }

  sendControl(message: CoopMessage) {
    if (message.type === "hello") {
      return typeof message.name === "string" && isPantId(message.pantId);
    }
    if (message.type === "action" && typeof message.action === "string") {
      return INPUT_ACTIONS.has(message.action)
        && this.sendFrame({ type: "action", action: message.action }, CONTROL_BUFFER_LIMIT, MAX_CONTROL_MESSAGE_BYTES);
    }
    if (message.type === "start") {
      return isCityId(message.city) && this.requestStart(message.city);
    }
    if (message.type === "upgrade" && typeof message.upgradeId === "string") {
      return this.chooseUpgrade(message.upgradeId);
    }
    return false;
  }

  sendInput(input: DedicatedInput) {
    if (!isFiniteNumber(input.dx, -1, 1) || !isFiniteNumber(input.dy, -1, 1)) return false;
    const length = Math.hypot(input.dx, input.dy);
    this.latestDx = length > 1 ? input.dx / length : input.dx;
    this.latestDy = length > 1 ? input.dy / length : input.dy;
    this.latestAttack = input.attack === true;
    return this.transmitInput();
  }

  requestStart(city: CityId) {
    if (!isCityId(city) || this.requestedRole !== this.leaderId) return false;
    return this.sendFrame({ type: "start", city }, CONTROL_BUFFER_LIMIT, MAX_CONTROL_MESSAGE_BYTES);
  }

  chooseUpgrade(upgradeId: string) {
    if (!UPGRADE_IDS.has(upgradeId) || this.requestedRole !== this.leaderId) return false;
    return this.sendFrame({ type: "upgrade", upgradeId }, CONTROL_BUFFER_LIMIT, MAX_CONTROL_MESSAGE_BYTES);
  }

  async close(removeRoom = this.requestedRole === "host") {
    void removeRoom;
    if (this.intentionalClose) return;
    this.sendFrame({ type: "leave" }, CONTROL_BUFFER_LIMIT, MAX_CONTROL_MESSAGE_BYTES);
    this.intentionalClose = true;
    this.terminal = true;
    this.clearTimers();
    this.handlers.onStatus?.("closed");
    const socket = this.socket;
    this.socket = null;
    if (socket && socket.readyState < 2) {
      try { socket.close(1000, "Client left room"); } catch { /* best effort */ }
    }
  }

  private transmitInput() {
    const nextSeq = this.inputSeq + 1;
    const sent = this.sendFrame({
      type: "input",
      seq: nextSeq,
      input: {
        dx: this.latestDx,
        dy: this.latestDy,
        attack: this.latestAttack,
      },
    }, STATE_BUFFER_LIMIT, MAX_INPUT_MESSAGE_BYTES);
    if (sent) this.inputSeq = nextSeq;
    return sent;
  }

  private openSocket(mode: ConnectionMode) {
    if (this.intentionalClose || this.terminal) return;
    let endpoint: string;
    try {
      endpoint = resolveServerUrl();
    } catch (cause) {
      this.handleAttemptFailure(cause instanceof Error ? cause.message : "The co-op server URL is invalid.");
      return;
    }

    const generation = ++this.generation;
    this.awaitingWelcome = true;
    let socket: WebSocket;
    try {
      socket = new WebSocket(endpoint, COOP_WEBSOCKET_PROTOCOL);
    } catch {
      this.handleAttemptFailure("The dedicated co-op server could not be reached.");
      return;
    }
    this.socket = socket;
    this.armWelcomeTimeout(generation, socket);

    socket.onopen = () => {
      if (generation !== this.generation || socket !== this.socket) return;
      if (socket.protocol !== COOP_WEBSOCKET_PROTOCOL) {
        this.protocolViolation("The co-op server selected an invalid protocol.");
        return;
      }
      const frame = this.authenticationFrame(mode);
      if (!frame || !this.sendAuthenticationFrame(socket, frame)) {
        this.protocolViolation("The co-op authentication request was invalid.");
      }
    };
    socket.onmessage = (event) => {
      if (generation !== this.generation || socket !== this.socket) return;
      if (typeof event.data !== "string") {
        this.protocolViolation("The co-op server sent an unsupported binary message.");
        return;
      }
      const message = readServerMessage(event.data);
      if (!message) {
        this.protocolViolation("The co-op server sent an invalid message.");
        return;
      }
      this.acceptServerMessage(message, mode);
    };
    socket.onerror = () => {
      // Browsers intentionally hide WebSocket error details. onclose handles retry/reporting.
    };
    socket.onclose = (event) => {
      if (generation !== this.generation) return;
      this.handleSocketClose(event.code);
    };
  }

  private authenticationFrame(mode: ConnectionMode): CoopMessage | null {
    if (mode === "create") {
      return {
        type: "create",
        protocolVersion: COOP_PROTOCOL_VERSION,
        buildId: COOP_BUILD_ID,
        identity: this.identity,
      };
    }
    if (mode === "join") {
      return {
        type: "join",
        protocolVersion: COOP_PROTOCOL_VERSION,
        buildId: COOP_BUILD_ID,
        roomId: this.roomIdValue,
        inviteToken: this.initialCredential,
        identity: this.identity,
      };
    }
    if (!ROOM_ID_PATTERN.test(this.roomIdValue) || !TOKEN_PATTERN.test(this.resumeToken)) return null;
    return {
      type: "resume",
      protocolVersion: COOP_PROTOCOL_VERSION,
      buildId: COOP_BUILD_ID,
      roomId: this.roomIdValue,
      playerId: this.requestedRole,
      resumeToken: this.resumeToken,
    };
  }

  private sendAuthenticationFrame(socket: WebSocket, frame: CoopMessage) {
    try {
      const serialized = JSON.stringify(frame);
      if (byteLength(serialized) > MAX_AUTH_MESSAGE_BYTES || socket.readyState !== 1) return false;
      socket.send(serialized);
      return true;
    } catch {
      return false;
    }
  }

  private sendFrame(frame: CoopMessage, bufferLimit: number, maxMessageBytes: number) {
    const socket = this.socket;
    if (!socket || socket.readyState !== 1 || this.awaitingWelcome || this.intentionalClose || this.terminal) return false;
    if (socket.bufferedAmount > HARD_BUFFER_LIMIT) {
      if (!this.highBufferSince) this.highBufferSince = Date.now();
      if (Date.now() - this.highBufferSince >= HARD_BUFFER_TIMEOUT_MS) {
        try { socket.close(1013, "Backpressure"); } catch { /* onclose handles recovery */ }
      }
      return false;
    }
    if (socket.bufferedAmount > bufferLimit) return false;
    this.highBufferSince = 0;
    try {
      const serialized = JSON.stringify(frame);
      if (byteLength(serialized) > maxMessageBytes) return false;
      socket.send(serialized);
      return true;
    } catch {
      return false;
    }
  }

  private acceptServerMessage(message: ServerMessage, mode: ConnectionMode) {
    if (this.awaitingWelcome && message.type !== "welcome" && message.type !== "error") {
      this.protocolViolation("The co-op server did not authenticate the connection first.");
      return;
    }
    if (message.type === "welcome") {
      this.acceptWelcome(message, mode);
      return;
    }
    if (message.type === "error") {
      if (this.awaitingWelcome) this.fatalServerError(message.message);
      else this.handlers.onControl?.({ type: "error", code: message.code, message: message.message, retryable: message.retryable });
      return;
    }
    if (message.type === "ping") {
      this.sendFrame({ type: "pong", nonce: message.nonce }, CONTROL_BUFFER_LIMIT, MAX_CONTROL_MESSAGE_BYTES);
      return;
    }
    if (message.type === "lobby") {
      this.acceptLobby(message);
      return;
    }
    if (message.type === "started") {
      this.lastSnapshotSeq = 0;
      this.lastServerTick = message.tick;
      const host = this.roster.find((player) => player.id === "host");
      const guest = this.roster.find((player) => player.id === "guest");
      this.handlers.onControl?.({
        type: "start",
        city: message.city,
        runId: message.state.runId,
        tick: message.tick,
        state: message.state,
        ...(host ? { host: { name: host.name, pantId: host.pantId } } : {}),
        ...(guest ? { guest: { name: guest.name, pantId: guest.pantId } } : {}),
      });
      return;
    }
    if (message.type === "snapshot") {
      if (message.seq <= this.lastSnapshotSeq || message.tick < this.lastServerTick) return;
      this.lastSnapshotSeq = message.seq;
      this.lastServerTick = message.tick;
      this.handlers.onState?.({
        type: "snapshot",
        seq: message.seq,
        tick: message.tick,
        serverTick: message.tick,
        ack: message.ack,
        state: message.state,
      });
      return;
    }
    this.handlers.onControl?.({
      type: "screen",
      screen: message.screen,
      tick: message.tick,
      choices: message.choices,
      upgradeId: message.upgradeId,
      result: message.result,
      receipt: message.receipt,
    });
  }

  private acceptWelcome(message: WelcomeMessage, mode: ConnectionMode) {
    if (!this.awaitingWelcome || message.role !== this.requestedRole) {
      this.protocolViolation("The co-op server returned the wrong player session.");
      return;
    }
    if (mode === "create" && (!message.inviteToken || message.role !== "host")) {
      this.protocolViolation("The co-op room response did not include an invite.");
      return;
    }
    if (mode !== "create" && this.roomIdValue && message.roomId !== this.roomIdValue) {
      this.protocolViolation("The co-op server returned the wrong room.");
      return;
    }

    this.clearWelcomeTimeout();
    this.awaitingWelcome = false;
    this.welcomed = true;
    this.roomIdValue = message.roomId;
    this.expiresAtValue = message.expiresAt;
    this.resumeToken = message.resumeToken;
    this.leaderId = "host";
    if (message.inviteToken) this.inviteTokenValue = message.inviteToken;
    this.initialCredential = "";
    this.reconnectAttempt = 0;
    this.reconnectDeadline = 0;
    this.highBufferSince = 0;
    this.handlers.onStatus?.(this.requestedRole === "host" ? "waiting" : "connecting");

    if (this.resolveInitial) {
      const resolve = this.resolveInitial;
      this.resolveInitial = null;
      this.rejectInitial = null;
      resolve();
    }
  }

  private acceptLobby(message: LobbyMessage) {
    if (message.roomId !== this.roomIdValue) {
      this.protocolViolation("The co-op lobby returned the wrong room.");
      return;
    }
    this.leaderId = message.leaderId;
    this.expiresAtValue = message.expiresAt;
    this.roster = message.players;
    const local = message.players.find((player) => player.id === this.requestedRole);
    if (!local) {
      this.protocolViolation("The co-op lobby omitted this player.");
      return;
    }
    const partner = message.players.find((player) => player.id !== this.requestedRole && player.connected);
    if (!partner) {
      this.partnerOpened = false;
      this.handlers.onStatus?.(this.requestedRole === "host" ? "waiting" : "connecting");
      return;
    }

    this.handlers.onStatus?.("connected");
    if (this.partnerOpened) return;
    this.partnerOpened = true;
    setTimeout(() => {
      if (this.intentionalClose || this.terminal || !this.partnerOpened) return;
      this.handlers.onOpen?.();
      this.handlers.onControl?.({ type: "hello", name: partner.name, pantId: partner.pantId });
    }, 0);
  }

  private armWelcomeTimeout(generation: number, socket: WebSocket) {
    this.clearWelcomeTimeout();
    const timeout = this.welcomed ? ACTIVE_WELCOME_TIMEOUT_MS : COLD_START_WELCOME_TIMEOUT_MS;
    this.welcomeTimer = setTimeout(() => {
      if (generation !== this.generation || socket !== this.socket || !this.awaitingWelcome) return;
      this.socket = null;
      this.generation += 1;
      try { socket.close(4000, "Welcome timeout"); } catch { /* failure is reported below */ }
      this.handleAttemptFailure("The dedicated co-op server timed out.");
    }, timeout);
  }

  private clearWelcomeTimeout() {
    if (this.welcomeTimer) clearTimeout(this.welcomeTimer);
    this.welcomeTimer = null;
  }

  private clearTimers() {
    this.clearWelcomeTimeout();
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
  }

  private handleSocketClose(code: number) {
    this.clearWelcomeTimeout();
    this.socket = null;
    this.awaitingWelcome = false;
    if (this.intentionalClose || this.terminal) return;

    if (!this.welcomed) {
      this.rejectInitialConnection(closeMessage(code, "The dedicated co-op server could not be reached."));
      return;
    }
    if (code === 1000) {
      this.terminal = true;
      this.handlers.onStatus?.("closed");
      this.handlers.onClose?.();
      return;
    }
    if (!shouldReconnect(code) || !TOKEN_PATTERN.test(this.resumeToken)) {
      this.finishConnectionError(closeMessage(code, "The dedicated co-op server disconnected."));
      return;
    }

    this.partnerOpened = false;
    this.handlers.onStatus?.("connecting");
    this.scheduleReconnect();
  }

  private handleAttemptFailure(message: string) {
    if (!this.welcomed) {
      this.rejectInitialConnection(message);
      return;
    }
    this.scheduleReconnect();
  }

  private scheduleReconnect() {
    if (this.intentionalClose || this.terminal) return;
    const now = Date.now();
    if (!this.reconnectDeadline) this.reconnectDeadline = now + RECONNECT_GRACE_MS;
    if (now >= this.reconnectDeadline) {
      this.finishConnectionError("The dedicated co-op server could not reconnect.");
      return;
    }
    const delay = RECONNECT_DELAYS_MS[Math.min(this.reconnectAttempt, RECONNECT_DELAYS_MS.length - 1)];
    this.reconnectAttempt += 1;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.openSocket("resume");
    }, Math.min(delay, Math.max(0, this.reconnectDeadline - now)));
  }

  private protocolViolation(message: string) {
    if (this.terminal) return;
    this.terminal = true;
    this.clearTimers();
    const socket = this.socket;
    this.socket = null;
    if (socket && socket.readyState < 2) {
      try { socket.close(1008, "Protocol violation"); } catch { /* best effort */ }
    }
    if (!this.welcomed) this.rejectInitialConnection(message);
    else {
      this.handlers.onStatus?.("closed");
      this.handlers.onError?.(message);
    }
  }

  private fatalServerError(message: string) {
    if (this.terminal) return;
    this.terminal = true;
    this.clearTimers();
    const socket = this.socket;
    this.socket = null;
    if (socket && socket.readyState < 2) {
      try { socket.close(1008, "Server rejected session"); } catch { /* best effort */ }
    }
    if (!this.welcomed) this.rejectInitialConnection(message);
    else {
      this.handlers.onStatus?.("closed");
      this.handlers.onError?.(message);
    }
  }

  private rejectInitialConnection(message: string) {
    if (!this.rejectInitial) return;
    this.terminal = true;
    this.clearTimers();
    const reject = this.rejectInitial;
    this.resolveInitial = null;
    this.rejectInitial = null;
    this.handlers.onStatus?.("closed");
    reject(new Error(message));
  }

  private finishConnectionError(message: string) {
    if (this.terminal) return;
    this.terminal = true;
    this.clearTimers();
    this.handlers.onStatus?.("closed");
    this.handlers.onError?.(message);
  }
}

export async function createCoopRoom(
  handlers: CoopConnectionHandlers,
  identity?: CoopIdentity,
) {
  const connection = new CoopConnection("host", "", "", 0, handlers, identity);
  await connection.start();
  if (!ROOM_ID_PATTERN.test(connection.roomId) || !TOKEN_PATTERN.test(connection.inviteToken)) {
    await connection.close();
    throw new Error("The dedicated co-op server returned an invalid room.");
  }
  return {
    connection,
    roomId: connection.roomId,
    inviteToken: connection.inviteToken,
    expiresAt: connection.expiresAt,
  };
}

export async function joinCoopRoom(
  invite: CoopInvite,
  handlers: CoopConnectionHandlers,
  identity?: CoopIdentity,
) {
  if (!ROOM_ID_PATTERN.test(invite.roomId) || !TOKEN_PATTERN.test(invite.inviteToken)) {
    throw new Error("The private co-op invite is invalid.");
  }
  const connection = new CoopConnection("guest", invite.roomId, invite.inviteToken, 0, handlers, identity);
  await connection.start();
  return { connection, roomId: connection.roomId, expiresAt: connection.expiresAt };
}
