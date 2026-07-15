import { getD1 } from "./index";

let leaderboardInitialization: Promise<void> | undefined;
let coopInitialization: Promise<void> | undefined;

export async function ensureLeaderboardSchemaForDev() {
  if (process.env.NODE_ENV === "production") return;
  if (!leaderboardInitialization) {
    const d1 = getD1();
    leaderboardInitialization = d1
      .batch([
        d1.prepare(`CREATE TABLE IF NOT EXISTS "leaderboard_entries" (
          "id" INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
          "run_id" TEXT NOT NULL,
          "player_name" TEXT NOT NULL,
          "score" INTEGER NOT NULL,
          "wave" INTEGER NOT NULL,
          "kills" INTEGER NOT NULL,
          "pant_id" TEXT NOT NULL,
          "mode" TEXT DEFAULT 'solo' NOT NULL,
          "created_at" TEXT DEFAULT CURRENT_TIMESTAMP NOT NULL,
          CHECK (length("player_name") BETWEEN 2 AND 18),
          CHECK ("score" BETWEEN 0 AND 1000000000),
          CHECK ("wave" BETWEEN 1 AND 9999),
          CHECK ("kills" BETWEEN 0 AND 10000000),
          CHECK ("mode" IN ('solo', 'coop'))
        )`),
        d1.prepare(`CREATE UNIQUE INDEX IF NOT EXISTS "leaderboard_run_id_uq"
          ON "leaderboard_entries" ("run_id")`),
        d1.prepare(`CREATE INDEX IF NOT EXISTS "leaderboard_rank_idx"
          ON "leaderboard_entries" ("score", "wave", "kills")`),
      ])
      .then(async () => {
        const columns = await d1
          .prepare(`PRAGMA table_info("leaderboard_entries")`)
          .all<{ name: string }>();
        const existingColumns = columns.results as Array<{ name: string }>;
        if (!existingColumns.some((column) => column.name === "mode")) {
          await d1
            .prepare(`ALTER TABLE "leaderboard_entries"
              ADD COLUMN "mode" TEXT DEFAULT 'solo' NOT NULL
              CHECK ("mode" IN ('solo', 'coop'))`)
            .run();
        }
      })
      .then(() => undefined)
      .catch((error: unknown) => {
        leaderboardInitialization = undefined;
        throw error;
      });
  }
  await leaderboardInitialization;
}

export async function ensureCoopSchemaForDev() {
  if (process.env.NODE_ENV === "production") return;
  if (!coopInitialization) {
    const d1 = getD1();
    coopInitialization = d1
      .batch([
        d1.prepare(`CREATE TABLE IF NOT EXISTS "coop_rooms" (
          "id" TEXT PRIMARY KEY NOT NULL,
          "host_token_hash" TEXT NOT NULL,
          "guest_invite_token_hash" TEXT NOT NULL,
          "guest_token_hash" TEXT,
          "status" TEXT DEFAULT 'waiting' NOT NULL,
          "protocol_version" INTEGER NOT NULL,
          "build_id" TEXT NOT NULL,
          "signal_count" INTEGER DEFAULT 0 NOT NULL,
          "created_at" INTEGER NOT NULL,
          "guest_joined_at" INTEGER,
          "last_activity_at" INTEGER NOT NULL,
          "expires_at" INTEGER NOT NULL,
          CONSTRAINT "coop_rooms_id_length" CHECK (length("id") = 22),
          CONSTRAINT "coop_rooms_host_hash_length" CHECK (length("host_token_hash") = 64),
          CONSTRAINT "coop_rooms_guest_invite_hash_length" CHECK (length("guest_invite_token_hash") = 64),
          CONSTRAINT "coop_rooms_guest_hash_length" CHECK ("guest_token_hash" IS NULL OR length("guest_token_hash") = 64),
          CONSTRAINT "coop_rooms_status" CHECK ("status" IN ('waiting', 'negotiating', 'connected')),
          CONSTRAINT "coop_rooms_protocol_version" CHECK ("protocol_version" BETWEEN 1 AND 9999),
          CONSTRAINT "coop_rooms_build_id_length" CHECK (length("build_id") BETWEEN 1 AND 64),
          CONSTRAINT "coop_rooms_signal_count" CHECK ("signal_count" BETWEEN 0 AND 128)
        )`),
        d1.prepare(`CREATE INDEX IF NOT EXISTS "coop_rooms_expires_idx"
          ON "coop_rooms" ("expires_at")`),
        d1.prepare(`CREATE TABLE IF NOT EXISTS "coop_signals" (
          "id" INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
          "room_id" TEXT NOT NULL,
          "sender" TEXT NOT NULL,
          "kind" TEXT NOT NULL,
          "client_seq" INTEGER NOT NULL,
          "payload" TEXT NOT NULL,
          "created_at" INTEGER NOT NULL,
          CONSTRAINT "coop_signals_sender" CHECK ("sender" IN ('host', 'guest')),
          CONSTRAINT "coop_signals_kind" CHECK ("kind" IN ('description', 'candidate', 'ready', 'connected', 'bye')),
          CONSTRAINT "coop_signals_client_seq" CHECK ("client_seq" BETWEEN 0 AND 2147483647),
          CONSTRAINT "coop_signals_payload_length" CHECK (length("payload") BETWEEN 1 AND 32768),
          FOREIGN KEY ("room_id") REFERENCES "coop_rooms"("id") ON UPDATE no action ON DELETE cascade
        )`),
        d1.prepare(`CREATE UNIQUE INDEX IF NOT EXISTS "coop_signals_sender_seq_uq"
          ON "coop_signals" ("room_id", "sender", "client_seq")`),
        d1.prepare(`CREATE INDEX IF NOT EXISTS "coop_signals_room_cursor_idx"
          ON "coop_signals" ("room_id", "id")`),
      ])
      .then(() => undefined)
      .catch((error: unknown) => {
        coopInitialization = undefined;
        throw error;
      });
  }
  await coopInitialization;
}
