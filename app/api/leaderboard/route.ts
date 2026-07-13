import { asc, desc, eq } from "drizzle-orm";
import { getDb } from "../../../db";
import { ensureLeaderboardSchemaForDev } from "../../../db/dev-init";
import { leaderboardEntries } from "../../../db/schema";
import { PANT_IDS } from "../../../lib/game-config";

const VALID_PANTS = new Set<string>(PANT_IDS);
const RUN_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_BODY_BYTES = 2048;

function error(message: string, status: number) {
  return Response.json({ error: message }, { status, headers: { "Cache-Control": "no-store" } });
}

function normalizeName(value: string) {
  return value.normalize("NFKC").trim().replace(/\s+/g, " ");
}

export async function GET() {
  try {
    return Response.json(
      { entries: [] },
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
    const elapsed = payload.elapsed;
    const pantId = typeof payload.pantId === "string" ? payload.pantId : "";
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
    if (typeof elapsed !== "number" || !Number.isFinite(elapsed) || elapsed < 1 || elapsed > 86_400) {
      return error("Invalid run duration", 400);
    }
    if (!VALID_PANTS.has(pantId)) return error("Invalid pants selection", 400);

    const scoreValue = score as number;
    const waveValue = wave as number;
    const killsValue = kills as number;
    const minimumDuration = Math.max(1, killsValue * 0.04 + (waveValue - 1) * 0.25);
    const maximumPlausibleScore = Math.ceil(killsValue * (2_500 + waveValue * 350) + waveValue * 2_000);
    if (waveValue > killsValue + 2 || killsValue > waveValue * 90 || elapsed < minimumDuration || scoreValue > maximumPlausibleScore) {
      return error("Run statistics are not plausible", 422);
    }

    const entry = {
      runId,
      playerName,
      score: scoreValue,
      wave: waveValue,
      kills: killsValue,
      pantId,
      createdAt: new Date().toISOString()
    };

    return Response.json(
      { entry, duplicate: false },
      { status: 201, headers: { "Cache-Control": "no-store" } },
    );
  } catch (cause) {
    console.error("Leaderboard submission failed", cause);
    return error("Score could not be submitted", 500);
  }
}
