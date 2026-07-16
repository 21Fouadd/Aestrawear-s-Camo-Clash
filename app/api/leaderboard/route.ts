import { asc, desc, eq } from "drizzle-orm";
import { env } from "cloudflare:workers";
import { getDb } from "../../../db";
import { ensureLeaderboardSchemaForDev } from "../../../db/dev-init";
import { leaderboardEntries } from "../../../db/schema";
import { PANT_IDS } from "../../../lib/game-config";

const VALID_PANTS = new Set<string>(PANT_IDS);
const VALID_MODES = new Set(["solo", "coop"]);
const RUN_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_BODY_BYTES = 2048;
const RECEIPT_PART = /^[A-Za-z0-9_-]+$/;
const RECEIPT_MAX_AGE_MS = 24 * 60 * 60 * 1000;

function error(message: string, status: number) {
  return Response.json({ error: message }, { status, headers: { "Cache-Control": "no-store" } });
}

function normalizeName(value: string) {
  return value.normalize("NFKC").trim().replace(/\s+/g, " ");
}

function decodeBase64Url(value: string): Uint8Array | null {
  if (!value || !RECEIPT_PART.test(value)) return null;
  try {
    const padded = value.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
    const decoded = atob(padded);
    return Uint8Array.from(decoded, (character) => character.charCodeAt(0));
  } catch {
    return null;
  }
}

async function verifyCoopReceipt(receipt: unknown, expected: Record<string, unknown>): Promise<boolean> {
  if (typeof receipt !== "string" || receipt.length > 1800) return false;
  const [body, signature, extra] = receipt.split(".");
  if (!body || !signature || extra !== undefined) return false;
  const bodyBytes = decodeBase64Url(body);
  const signatureBytes = decodeBase64Url(signature);
  if (!bodyBytes || !signatureBytes || signatureBytes.byteLength !== 32) return false;

  const runtimeEnv = env as typeof env & { MATCH_TICKET_SECRET?: string };
  const secret = runtimeEnv.MATCH_TICKET_SECRET;
  if (!secret || secret.length < 32) throw new Error("MATCH_TICKET_SECRET is unavailable");
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["verify"],
  );
  const validSignature = await crypto.subtle.verify(
    "HMAC",
    key,
    signatureBytes as Uint8Array<ArrayBuffer>,
    new TextEncoder().encode(body),
  );
  if (!validSignature) return false;

  try {
    const payload = JSON.parse(new TextDecoder().decode(bodyBytes)) as Record<string, unknown>;
    const issuedAt = payload.issuedAt;
    const now = Date.now();
    if (!Number.isSafeInteger(issuedAt) || (issuedAt as number) > now + 5 * 60_000 || (issuedAt as number) < now - RECEIPT_MAX_AGE_MS) return false;
    if (typeof payload.roomId !== "string" || !/^[A-Za-z0-9_-]{22}$/.test(payload.roomId)) return false;
    for (const [keyName, expectedValue] of Object.entries(expected)) {
      if (payload[keyName] !== expectedValue) return false;
    }
    return true;
  } catch {
    return false;
  }
}

export async function GET() {
  try {
    await ensureLeaderboardSchemaForDev();
    const rows = await getDb()
      .select({
        id: leaderboardEntries.id,
        playerName: leaderboardEntries.playerName,
        score: leaderboardEntries.score,
        wave: leaderboardEntries.wave,
        kills: leaderboardEntries.kills,
        pantId: leaderboardEntries.pantId,
        mode: leaderboardEntries.mode,
        createdAt: leaderboardEntries.createdAt,
      })
      .from(leaderboardEntries)
      .orderBy(
        desc(leaderboardEntries.score),
        desc(leaderboardEntries.wave),
        desc(leaderboardEntries.kills),
        asc(leaderboardEntries.createdAt),
      )
      .limit(10);

    return Response.json(
      { entries: rows.map((entry, index) => ({ ...entry, rank: index + 1 })) },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (cause) {
    console.error("Leaderboard read failed", cause);
    return error("Leaderboard is temporarily unavailable", 500);
  }
}

export async function POST(request: Request) {
  try {
    if (!request.headers.get("content-type")?.includes("application/json")) {
      return error("Content-Type must be application/json", 415);
    }
    const raw = await request.text();
    if (new TextEncoder().encode(raw).byteLength > MAX_BODY_BYTES) {
      return error("Request body is too large", 413);
    }

    const payload = JSON.parse(raw) as Record<string, unknown>;
    const runId = typeof payload.runId === "string" ? payload.runId.toLowerCase() : "";
    const playerName = typeof payload.playerName === "string" ? normalizeName(payload.playerName) : "";
    const score = payload.score;
    const wave = payload.wave;
    const kills = payload.kills;
    const maxCombo = payload.maxCombo;
    const elapsed = payload.elapsed;
    const pantId = typeof payload.pantId === "string" ? payload.pantId : "";
    const mode = typeof payload.mode === "string" ? payload.mode : "solo";
    const nameLength = Array.from(playerName).length;

    if (!RUN_ID.test(runId)) return error("Invalid run ID", 400);
    if (nameLength < 2 || nameLength > 18 || !/^[\p{L}\p{N} _-]+$/u.test(playerName)) {
      return error("Name must be 2–18 letters, numbers, spaces, underscores, or hyphens", 400);
    }
    if (!Number.isSafeInteger(score) || (score as number) < 0 || (score as number) > 1_000_000_000) {
      return error("Invalid score", 400);
    }
    if (!Number.isSafeInteger(wave) || (wave as number) < 1 || (wave as number) > 9999) {
      return error("Invalid wave", 400);
    }
    if (!Number.isSafeInteger(kills) || (kills as number) < 0 || (kills as number) > 10_000_000) {
      return error("Invalid knockout count", 400);
    }
    if (!Number.isSafeInteger(maxCombo) || (maxCombo as number) < 0 || (maxCombo as number) > 1_000_000) {
      return error("Invalid maximum combo", 400);
    }
    if (typeof elapsed !== "number" || !Number.isFinite(elapsed) || elapsed < 1 || elapsed > 86_400) {
      return error("Invalid run duration", 400);
    }
    if (!VALID_PANTS.has(pantId)) return error("Invalid pants selection", 400);
    if (!VALID_MODES.has(mode)) return error("Invalid game mode", 400);

    const scoreValue = score as number;
    const waveValue = wave as number;
    const killsValue = kills as number;
    const minimumDuration = Math.max(1, killsValue * 0.04 + (waveValue - 1) * 0.25);
    const maximumPlausibleScore = Math.ceil(killsValue * (2_500 + waveValue * 350) + waveValue * 2_000);
    if (waveValue > killsValue + 2 || killsValue > waveValue * 90 || elapsed < minimumDuration || scoreValue > maximumPlausibleScore) {
      return error("Run statistics are not plausible", 422);
    }
    if (mode === "coop") {
      const receiptValid = await verifyCoopReceipt(payload.receipt, {
        runId,
        score: scoreValue,
        wave: waveValue,
        kills: killsValue,
        maxCombo: maxCombo as number,
        elapsed,
        mode,
        playerName,
        pantId,
      });
      if (!receiptValid) return error("This co-op score is missing a valid match-server receipt", 403);
    }

    await ensureLeaderboardSchemaForDev();
    const db = getDb();
    const [entry] = await db
      .insert(leaderboardEntries)
      .values({
        runId,
        playerName,
        score: scoreValue,
        wave: waveValue,
        kills: killsValue,
        pantId,
        mode,
      })
      .onConflictDoNothing({ target: leaderboardEntries.runId })
      .returning();

    if (!entry) {
      const [existing] = await db
        .select()
        .from(leaderboardEntries)
        .where(eq(leaderboardEntries.runId, runId))
        .limit(1);
      return Response.json({ entry: existing, duplicate: true }, { headers: { "Cache-Control": "no-store" } });
    }

    return Response.json(
      { entry, duplicate: false },
      { status: 201, headers: { "Cache-Control": "no-store" } },
    );
  } catch (cause) {
    console.error("Leaderboard submission failed", cause);
    return error("Score could not be submitted", 500);
  }
}
