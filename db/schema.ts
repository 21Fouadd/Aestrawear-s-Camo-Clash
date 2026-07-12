import { sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

export const leaderboardEntries = sqliteTable(
  "leaderboard_entries",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    runId: text("run_id").notNull(),
    playerName: text("player_name").notNull(),
    score: integer("score").notNull(),
    wave: integer("wave").notNull(),
    kills: integer("kills").notNull(),
    pantId: text("pant_id").notNull(),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    uniqueIndex("leaderboard_run_id_uq").on(table.runId),
    index("leaderboard_rank_idx").on(table.score, table.wave, table.kills),
    check("leaderboard_name_length", sql`length(${table.playerName}) BETWEEN 2 AND 18`),
    check("leaderboard_score_range", sql`${table.score} BETWEEN 0 AND 1000000000`),
    check("leaderboard_wave_range", sql`${table.wave} BETWEEN 1 AND 9999`),
    check("leaderboard_kills_range", sql`${table.kills} BETWEEN 0 AND 10000000`),
  ],
);
