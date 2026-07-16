import assert from "node:assert/strict";
import test from "node:test";
import WebSocket from "ws";
import { BUILD_ID, PROTOCOL_VERSION, WS_SUBPROTOCOL } from "../src/protocol.ts";
import { startGameServer, type GameServerHandle } from "../src/index.ts";

type Message = Record<string, unknown>;

class Inbox {
  private readonly messages: Message[] = [];
  private readonly waiters = new Set<() => void>();

  constructor(socket: WebSocket) {
    socket.on("message", (raw) => {
      const parsed = JSON.parse(raw.toString()) as Message;
      this.messages.push(parsed);
      for (const notify of this.waiters) notify();
    });
  }

  async waitFor(type: string, predicate: (message: Message) => boolean = () => true, timeoutMs = 4_000): Promise<Message> {
    const find = () => {
      const index = this.messages.findIndex((message) => message.type === type && predicate(message));
      if (index < 0) return null;
      return this.messages.splice(index, 1)[0];
    };
    const immediate = find();
    if (immediate) return immediate;
    return await new Promise<Message>((resolve, reject) => {
      const timer = setTimeout(() => { this.waiters.delete(check); reject(new Error(`Timed out waiting for ${type}`)); }, timeoutMs);
      const check = () => {
        const message = find();
        if (!message) return;
        clearTimeout(timer);
        this.waiters.delete(check);
        resolve(message);
      };
      this.waiters.add(check);
    });
  }
}

async function openSocket(server: GameServerHandle, origin = "http://localhost:3000") {
  const socket = new WebSocket(server.url, WS_SUBPROTOCOL, { origin });
  await new Promise<void>((resolve, reject) => {
    socket.once("open", () => resolve());
    socket.once("error", reject);
  });
  return { socket, inbox: new Inbox(socket) };
}

function send(socket: WebSocket, message: Message) {
  socket.send(JSON.stringify(message));
}

test("authoritative server owns room, start, inputs, and snapshots", async (t) => {
  const server = await startGameServer({
    host: "127.0.0.1",
    port: 0,
    allowedOrigins: ["http://localhost:3000"],
    matchTicketSecret: "test-secret-that-is-longer-than-thirty-two-characters",
    logLevel: "silent",
  });
  t.after(async () => server.close());

  const health = await fetch(`http://127.0.0.1:${server.port}/healthz`).then((response) => response.json()) as Message;
  assert.equal(health.ok, true);
  assert.equal(health.region, "local");

  const host = await openSocket(server);
  t.after(() => host.socket.close());
  send(host.socket, {
    type: "create",
    protocolVersion: PROTOCOL_VERSION,
    buildId: BUILD_ID,
    identity: { name: "HOST ONE", pantId: "ghost" },
  });
  const hostWelcome = await host.inbox.waitFor("welcome");
  assert.equal(hostWelcome.role, "host");
  assert.match(host.socket.extensions, /permessage-deflate/);
  assert.match(String(hostWelcome.roomId), /^[A-Za-z0-9_-]{22}$/);
  assert.match(String(hostWelcome.inviteToken), /^[A-Za-z0-9_-]{43}$/);

  const guest = await openSocket(server);
  t.after(() => guest.socket.close());
  send(guest.socket, {
    type: "join",
    protocolVersion: PROTOCOL_VERSION,
    buildId: BUILD_ID,
    roomId: hostWelcome.roomId,
    inviteToken: hostWelcome.inviteToken,
    identity: { name: "GUEST TWO", pantId: "surge" },
  });
  const guestWelcome = await guest.inbox.waitFor("welcome");
  assert.equal(guestWelcome.role, "guest");
  const readyLobby = await host.inbox.waitFor("lobby", (message) => message.phase === "ready");
  assert.equal((readyLobby.players as unknown[]).length, 2);

  const replay = await openSocket(server);
  send(replay.socket, {
    type: "join",
    protocolVersion: PROTOCOL_VERSION,
    buildId: BUILD_ID,
    roomId: hostWelcome.roomId,
    inviteToken: hostWelcome.inviteToken,
    identity: { name: "REPLAY", pantId: "guard" },
  });
  const replayError = await replay.inbox.waitFor("error");
  assert.equal(replayError.code, "ROOM_UNAVAILABLE");

  send(guest.socket, { type: "start", city: "neon" });
  const denied = await guest.inbox.waitFor("error");
  assert.equal(denied.code, "START_DENIED");

  send(host.socket, { type: "start", city: "harbor" });
  const hostStarted = await host.inbox.waitFor("started");
  const guestStarted = await guest.inbox.waitFor("started");
  assert.equal(hostStarted.city, "harbor");
  assert.equal(guestStarted.city, "harbor");
  assert.equal(((hostStarted.state as Message).players as unknown[]).length, 2);

  send(host.socket, { type: "input", seq: 1, input: { dx: 1, dy: 0, attack: false } });
  const snapshot = await host.inbox.waitFor("snapshot", (message) => {
    const ack = message.ack as Message | undefined;
    return ack?.host === 1 && Number(message.tick) >= 3;
  });
  const state = snapshot.state as Message;
  const players = state.players as Array<Message>;
  const authoritativeHost = players.find((player) => player.id === "host");
  assert.ok(authoritativeHost);
  assert.ok(Number(authoritativeHost.x) > 596, "server simulation should move the host");

  guest.socket.terminate();
  const disconnectedLobby = await host.inbox.waitFor("lobby", (message) => {
    const players = message.players as Array<Message> | undefined;
    return players?.some((player) => player.id === "guest" && player.connected === false) === true;
  });
  assert.equal(disconnectedLobby.phase, "playing");

  const resumedGuest = await openSocket(server);
  t.after(() => resumedGuest.socket.close());
  send(resumedGuest.socket, {
    type: "resume",
    protocolVersion: PROTOCOL_VERSION,
    buildId: BUILD_ID,
    roomId: hostWelcome.roomId,
    playerId: "guest",
    resumeToken: guestWelcome.resumeToken,
  });
  const resumedWelcome = await resumedGuest.inbox.waitFor("welcome");
  assert.equal(resumedWelcome.resumed, true);
  await resumedGuest.inbox.waitFor("started");
  await resumedGuest.inbox.waitFor("snapshot");
  const reconnectedLobby = await host.inbox.waitFor("lobby", (message) => {
    const players = message.players as Array<Message> | undefined;
    return players?.some((player) => player.id === "guest" && player.connected === true) === true;
  });
  assert.equal(reconnectedLobby.phase, "playing");

  send(resumedGuest.socket, { type: "input", seq: 1, input: { dx: -1, dy: 0, attack: false } });
  await resumedGuest.inbox.waitFor("snapshot", (message) => (message.ack as Message | undefined)?.guest === 1);
});

test("rejects non-allowlisted browser origins", async (t) => {
  const server = await startGameServer({
    host: "127.0.0.1",
    port: 0,
    allowedOrigins: ["http://localhost:3000"],
    matchTicketSecret: "test-secret-that-is-longer-than-thirty-two-characters",
    logLevel: "silent",
  });
  t.after(async () => server.close());

  const socket = new WebSocket(server.url, WS_SUBPROTOCOL, { origin: "https://evil.example" });
  const status = await new Promise<number>((resolve, reject) => {
    socket.once("unexpected-response", (_request, response) => resolve(response.statusCode ?? 0));
    socket.once("open", () => reject(new Error("Unexpectedly accepted disallowed origin")));
    socket.once("error", () => undefined);
  });
  assert.equal(status, 403);
});
