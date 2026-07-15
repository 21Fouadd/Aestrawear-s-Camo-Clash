import { getD1 } from "../../../db";
import { ensureCoopSchemaForDev } from "../../../db/dev-init";

export const ROOM_TTL_MS = 10 * 60 * 1000;
export const MAX_ROOM_SIGNALS = 128;
export const MAX_SIGNAL_BATCH = 8;
export const MAX_SIGNAL_PAGE = 32;
export const MAX_SDP_BYTES = 24 * 1024;
export const MAX_CANDIDATE_BYTES = 2 * 1024;
export const MAX_CONTROL_BYTES = 512;
export const MAX_SIGNAL_BODY_BYTES = 32 * 1024;

export const NO_STORE_HEADERS = {
  "Cache-Control": "no-store, max-age=0",
  Pragma: "no-cache",
} as const;

const ROOM_ID = /^[A-Za-z0-9_-]{22}$/;
const CAPABILITY_TOKEN = /^[A-Za-z0-9_-]{43}$/;
const BUILD_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;
const encoder = new TextEncoder();

export type CoopRole = "host" | "guest";
export type CoopStatus = "waiting" | "negotiating" | "connected";

export type AuthorizedRoom = {
  id: string;
  role: CoopRole;
  status: CoopStatus;
  protocolVersion: number;
  buildId: string;
  guestJoinedAt: number | null;
  expiresAt: number;
  signalCount: number;
};

type AuthorizationRow = Omit<AuthorizedRoom, "role"> & { role: CoopRole | null };

export function jsonResponse(value: unknown, init: ResponseInit = {}) {
  const headers = new Headers(init.headers);
  for (const [name, headerValue] of Object.entries(NO_STORE_HEADERS)) {
    if (!headers.has(name)) headers.set(name, headerValue);
  }
  return Response.json(value, {
    ...init,
    headers,
  });
}

export function jsonError(message: string, status: number) {
  return jsonResponse({ error: message }, { status });
}

export function rejectCrossOrigin(request: Request): Response | null {
  const fetchSite = request.headers.get("sec-fetch-site");
  if (fetchSite && fetchSite !== "same-origin" && fetchSite !== "none") {
    return jsonError("Cross-origin requests are not allowed", 403);
  }

  const origin = request.headers.get("origin");
  if (!origin) return null;

  try {
    if (new URL(origin).origin === new URL(request.url).origin) return null;
  } catch {
    // A malformed or opaque Origin is not a valid same-origin request.
  }
  return jsonError("Cross-origin requests are not allowed", 403);
}

export async function readJsonObject(
  request: Request,
  maxBytes: number,
): Promise<{ ok: true; value: Record<string, unknown> } | { ok: false; response: Response }> {
  if (!request.headers.get("content-type")?.toLowerCase().includes("application/json")) {
    return { ok: false, response: jsonError("Content-Type must be application/json", 415) };
  }

  const contentLength = request.headers.get("content-length");
  if (contentLength) {
    const declaredBytes = Number(contentLength);
    if (!Number.isFinite(declaredBytes) || declaredBytes < 0 || declaredBytes > maxBytes) {
      return { ok: false, response: jsonError("Request body is too large", 413) };
    }
  }

  const raw = await request.text();
  if (encoder.encode(raw).byteLength > maxBytes) {
    return { ok: false, response: jsonError("Request body is too large", 413) };
  }

  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!isRecord(parsed)) throw new Error("Expected an object");
    return { ok: true, value: parsed };
  } catch {
    return { ok: false, response: jsonError("Request body must be a JSON object", 400) };
  }
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function isValidRoomId(value: unknown): value is string {
  return typeof value === "string" && ROOM_ID.test(value);
}

export function isValidProtocolVersion(value: unknown): value is number {
  return Number.isInteger(value) && (value as number) >= 1 && (value as number) <= 9999;
}

export function isValidBuildId(value: unknown): value is string {
  return typeof value === "string" && BUILD_ID.test(value);
}

export function extractBearerToken(request: Request): string | null {
  const match = /^Bearer ([A-Za-z0-9_-]{43})$/.exec(request.headers.get("authorization") ?? "");
  return match && CAPABILITY_TOKEN.test(match[1]) ? match[1] : null;
}

export function byteLength(value: string) {
  return encoder.encode(value).byteLength;
}

export function randomCapability(byteCount: 16 | 32) {
  const bytes = crypto.getRandomValues(new Uint8Array(byteCount));
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

export async function hashCapability(token: string) {
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(token));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function ensureCoopSchema() {
  await ensureCoopSchemaForDev();
  return getD1();
}

export async function cleanupExpiredRooms(now = Date.now()) {
  const d1 = getD1();
  await d1.batch([
    d1.prepare(`DELETE FROM "coop_signals"
      WHERE "room_id" IN (SELECT "id" FROM "coop_rooms" WHERE "expires_at" <= ?1)`).bind(now),
    d1.prepare(`DELETE FROM "coop_rooms" WHERE "expires_at" <= ?1`).bind(now),
  ]);
}

export async function authorizeRoom(
  roomId: string,
  token: string,
  now = Date.now(),
): Promise<AuthorizedRoom | null> {
  const tokenHash = await hashCapability(token);
  const row = await getD1()
    .prepare(`SELECT
      "id",
      CASE
        WHEN "host_token_hash" = ?1 THEN 'host'
        WHEN "guest_token_hash" = ?1 THEN 'guest'
        ELSE NULL
      END AS "role",
      "status",
      "protocol_version" AS "protocolVersion",
      "build_id" AS "buildId",
      "guest_joined_at" AS "guestJoinedAt",
      "expires_at" AS "expiresAt",
      "signal_count" AS "signalCount"
    FROM "coop_rooms"
    WHERE "id" = ?2 AND "expires_at" > ?3`)
    .bind(tokenHash, roomId, now)
    .first<AuthorizationRow>();

  if (!row || (row.role !== "host" && row.role !== "guest")) return null;
  return row as AuthorizedRoom;
}
