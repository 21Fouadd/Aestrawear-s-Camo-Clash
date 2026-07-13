import { getD1 } from "./index";

let initialization: Promise<void> | undefined;

export async function ensureLeaderboardSchemaForDev() {
  if (process.env.NODE_ENV === "production") return;
  if (!initialization) {
    const d1 = getD1();
    initialization = d1
      .batch([
        d1.prepare(`CREATE TABLE IF NOT EXISTS "leaderboard_entries" (
          "id" INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
          "run_id" TEXT NOT NULL,
          "player_name" TEXT NOT NULL,
          "score" INTEGER NOT NULL,
          "wave" INTEGER NOT NULL,
          "kills" INTEGER NOT NULL,
          "pant_id" TEXT NOT NULL,
          "created_at" TEXT DEFAULT CURRENT_TIMESTAMP NOT NULL,
          CHECK (length("player_name") BETWEEN 2 AND 18),
          CHECK ("score" BETWEEN 0 AND 1000000000),
          CHECK ("wave" BETWEEN 1 AND 9999),
          CHECK ("kills" BETWEEN 0 AND 10000000)
        )`),
        d1.prepare(`CREATE UNIQUE INDEX IF NOT EXISTS "leaderboard_run_id_uq"
          ON "leaderboard_entries" ("run_id")`),
        d1.prepare(`CREATE INDEX IF NOT EXISTS "leaderboard_rank_idx"
          ON "leaderboard_entries" ("score", "wave", "kills")`),
      ])
      .then(() => undefined)
      .catch((error) => {
        initialization = undefined;
        throw error;
      });
  }
  await initialization;
}
