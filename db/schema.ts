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
    mode: text("mode").notNull().default("solo"),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    uniqueIndex("leaderboard_run_id_uq").on(table.runId),
    index("leaderboard_rank_idx").on(table.score, table.wave, table.kills),
    check("leaderboard_name_length", sql`length(${table.playerName}) BETWEEN 2 AND 18`),
    check("leaderboard_score_range", sql`${table.score} BETWEEN 0 AND 1000000000`),
    check("leaderboard_wave_range", sql`${table.wave} BETWEEN 1 AND 9999`),
    check("leaderboard_kills_range", sql`${table.kills} BETWEEN 0 AND 10000000`),
    check("leaderboard_mode", sql`${table.mode} IN ('solo', 'coop')`),
  ],
);

export const coopRooms = sqliteTable(
  "coop_rooms",
  {
    id: text("id").primaryKey(),
    hostTokenHash: text("host_token_hash").notNull(),
    guestInviteTokenHash: text("guest_invite_token_hash").notNull(),
    guestTokenHash: text("guest_token_hash"),
    status: text("status").notNull().default("waiting"),
    protocolVersion: integer("protocol_version").notNull(),
    buildId: text("build_id").notNull(),
    signalCount: integer("signal_count").notNull().default(0),
    createdAt: integer("created_at").notNull(),
    guestJoinedAt: integer("guest_joined_at"),
    lastActivityAt: integer("last_activity_at").notNull(),
    expiresAt: integer("expires_at").notNull(),
  },
  (table) => [
    index("coop_rooms_expires_idx").on(table.expiresAt),
    check("coop_rooms_id_length", sql`length(${table.id}) = 22`),
    check("coop_rooms_host_hash_length", sql`length(${table.hostTokenHash}) = 64`),
    check("coop_rooms_guest_invite_hash_length", sql`length(${table.guestInviteTokenHash}) = 64`),
    check("coop_rooms_guest_hash_length", sql`${table.guestTokenHash} IS NULL OR length(${table.guestTokenHash}) = 64`),
    check("coop_rooms_status", sql`${table.status} IN ('waiting', 'negotiating', 'connected')`),
    check("coop_rooms_protocol_version", sql`${table.protocolVersion} BETWEEN 1 AND 9999`),
    check("coop_rooms_build_id_length", sql`length(${table.buildId}) BETWEEN 1 AND 64`),
    check("coop_rooms_signal_count", sql`${table.signalCount} BETWEEN 0 AND 128`),
  ],
);

export const coopSignals = sqliteTable(
  "coop_signals",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    roomId: text("room_id")
      .notNull()
      .references(() => coopRooms.id, { onDelete: "cascade" }),
    sender: text("sender").notNull(),
    kind: text("kind").notNull(),
    clientSeq: integer("client_seq").notNull(),
    payload: text("payload").notNull(),
    createdAt: integer("created_at").notNull(),
  },
  (table) => [
    uniqueIndex("coop_signals_sender_seq_uq").on(table.roomId, table.sender, table.clientSeq),
    index("coop_signals_room_cursor_idx").on(table.roomId, table.id),
    check("coop_signals_sender", sql`${table.sender} IN ('host', 'guest')`),
    check("coop_signals_kind", sql`${table.kind} IN ('description', 'candidate', 'ready', 'connected', 'bye')`),
    check("coop_signals_client_seq", sql`${table.clientSeq} BETWEEN 0 AND 2147483647`),
    check("coop_signals_payload_length", sql`length(${table.payload}) BETWEEN 1 AND 32768`),
  ],
);
