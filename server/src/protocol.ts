import type { PantId } from "../../lib/game-config.ts";

export const PROTOCOL_VERSION = 2;
export const BUILD_ID = "camo-clash-server-2";
export const WS_SUBPROTOCOL = "camo-clash.v2";
export const MAX_CLIENT_MESSAGE_BYTES = 4 * 1024;

export type FighterId = "host" | "guest";
export type CityId = "neon" | "harbor" | "blackout";
export type RoomPhase = "waiting" | "ready" | "playing" | "upgrade" | "gameover";

export type Identity = {
  name: string;
  pantId: PantId;
};

export type InputPayload = {
  dx: number;
  dy: number;
  attack: boolean;
  revive: boolean;
  sentAt: number;
};

export type CreateMessage = {
  type: "create";
  protocolVersion: number;
  buildId: string;
  identity: Identity;
};

export type JoinMessage = {
  type: "join";
  protocolVersion: number;
  buildId: string;
  roomId: string;
  inviteToken: string;
  identity: Identity;
};

export type ResumeMessage = {
  type: "resume";
  protocolVersion: number;
  buildId: string;
  roomId: string;
  playerId: FighterId;
  resumeToken: string;
};

export type InitialMessage = CreateMessage | JoinMessage | ResumeMessage;

export type ClientMessage = InitialMessage | {
  type: "input";
  seq: number;
  input: InputPayload;
} | {
  type: "action";
  action: "attackQueued" | "dash" | "ability" | "swap" | "reload";
} | {
  type: "pant";
  pantId: PantId;
} | {
  type: "start";
  city: CityId;
} | {
  type: "upgrade";
  upgradeId: string;
} | {
  type: "pong";
  nonce: number;
} | {
  type: "leave";
};

export type SafeUpgrade = { id: string; name: string; description: string };

const PANT_IDS = new Set<PantId>(["ghost", "chain", "guard", "surge"]);
const CITY_IDS = new Set<CityId>(["neon", "harbor", "blackout"]);
const ROOM_ID = /^[A-Za-z0-9_-]{22}$/;
const TOKEN = /^[A-Za-z0-9_-]{43}$/;
const ACTIONS = new Set(["attackQueued", "dash", "ability", "swap", "reload"]);

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function isPantId(value: unknown): value is PantId {
  return typeof value === "string" && PANT_IDS.has(value as PantId);
}

export function normalizeName(value: unknown, fallback: string): string {
  if (typeof value !== "string") return fallback;
  const normalized = value.normalize("NFKC").trim().replace(/\s+/g, " ").slice(0, 18);
  if (Array.from(normalized).length < 2 || !/^[\p{L}\p{N} _-]+$/u.test(normalized)) return fallback;
  return normalized;
}

export function readIdentity(value: unknown, fallback: string): Identity | null {
  if (!isRecord(value) || !isPantId(value.pantId)) return null;
  return { name: normalizeName(value.name, fallback), pantId: value.pantId };
}

export function isRoomId(value: unknown): value is string {
  return typeof value === "string" && ROOM_ID.test(value);
}

export function isToken(value: unknown): value is string {
  return typeof value === "string" && TOKEN.test(value);
}

export function isCityId(value: unknown): value is CityId {
  return typeof value === "string" && CITY_IDS.has(value as CityId);
}

export function readInitialMessage(value: unknown): InitialMessage | null {
  if (!isRecord(value) || value.protocolVersion !== PROTOCOL_VERSION || value.buildId !== BUILD_ID) return null;
  if (value.type === "create") {
    const identity = readIdentity(value.identity, "FIGHTER 01");
    return identity ? { type: "create", protocolVersion: PROTOCOL_VERSION, buildId: BUILD_ID, identity } : null;
  }
  if (value.type === "join") {
    const identity = readIdentity(value.identity, "FIGHTER 02");
    if (!identity || !isRoomId(value.roomId) || !isToken(value.inviteToken)) return null;
    return { type: "join", protocolVersion: PROTOCOL_VERSION, buildId: BUILD_ID, roomId: value.roomId, inviteToken: value.inviteToken, identity };
  }
  if (value.type === "resume") {
    if (!isRoomId(value.roomId) || !isToken(value.resumeToken) || (value.playerId !== "host" && value.playerId !== "guest")) return null;
    return { type: "resume", protocolVersion: PROTOCOL_VERSION, buildId: BUILD_ID, roomId: value.roomId, playerId: value.playerId, resumeToken: value.resumeToken };
  }
  return null;
}

export function readClientMessage(value: unknown): ClientMessage | null {
  if (!isRecord(value) || typeof value.type !== "string") return null;
  if (value.type === "input") {
    if (!Number.isSafeInteger(value.seq) || (value.seq as number) < 1 || !isRecord(value.input)) return null;
    const rawDx = value.input.dx;
    const rawDy = value.input.dy;
    if (typeof rawDx !== "number" || !Number.isFinite(rawDx) || typeof rawDy !== "number" || !Number.isFinite(rawDy)) return null;
    const sentAt = value.input.sentAt === undefined ? 0 : value.input.sentAt;
    if (!Number.isSafeInteger(sentAt) || (sentAt as number) < 0) return null;
    let dx = Math.max(-1, Math.min(1, rawDx));
    let dy = Math.max(-1, Math.min(1, rawDy));
    const length = Math.hypot(dx, dy);
    if (length > 1) { dx /= length; dy /= length; }
    return { type: "input", seq: value.seq as number, input: { dx, dy, attack: value.input.attack === true, revive: value.input.revive === true, sentAt: sentAt as number } };
  }
  if (value.type === "action" && typeof value.action === "string" && ACTIONS.has(value.action)) {
    return { type: "action", action: value.action as "attackQueued" | "dash" | "ability" | "swap" | "reload" };
  }
  if (value.type === "pant" && isPantId(value.pantId)) return { type: "pant", pantId: value.pantId };
  if (value.type === "start" && isCityId(value.city)) return { type: "start", city: value.city };
  if (value.type === "upgrade" && typeof value.upgradeId === "string" && /^[a-z][a-z0-9-]{0,31}$/.test(value.upgradeId)) {
    return { type: "upgrade", upgradeId: value.upgradeId };
  }
  if (value.type === "pong" && Number.isSafeInteger(value.nonce)) return { type: "pong", nonce: value.nonce as number };
  if (value.type === "leave") return { type: "leave" };
  return null;
}

export function parseJsonMessage(raw: Buffer | ArrayBuffer | Buffer[]): unknown | null {
  const bytes = Array.isArray(raw)
    ? Buffer.concat(raw)
    : Buffer.isBuffer(raw)
      ? raw
      : Buffer.from(new Uint8Array(raw));
  if (bytes.byteLength === 0 || bytes.byteLength > MAX_CLIENT_MESSAGE_BYTES) return null;
  try {
    return JSON.parse(bytes.toString("utf8")) as unknown;
  } catch {
    return null;
  }
}
