CREATE TABLE `coop_rooms` (
	`id` text PRIMARY KEY NOT NULL,
	`host_token_hash` text NOT NULL,
	`guest_invite_token_hash` text NOT NULL,
	`guest_token_hash` text,
	`status` text DEFAULT 'waiting' NOT NULL,
	`protocol_version` integer NOT NULL,
	`build_id` text NOT NULL,
	`signal_count` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	`guest_joined_at` integer,
	`last_activity_at` integer NOT NULL,
	`expires_at` integer NOT NULL,
	CONSTRAINT "coop_rooms_id_length" CHECK(length("coop_rooms"."id") = 22),
	CONSTRAINT "coop_rooms_host_hash_length" CHECK(length("coop_rooms"."host_token_hash") = 64),
	CONSTRAINT "coop_rooms_guest_invite_hash_length" CHECK(length("coop_rooms"."guest_invite_token_hash") = 64),
	CONSTRAINT "coop_rooms_guest_hash_length" CHECK("coop_rooms"."guest_token_hash" IS NULL OR length("coop_rooms"."guest_token_hash") = 64),
	CONSTRAINT "coop_rooms_status" CHECK("coop_rooms"."status" IN ('waiting', 'negotiating', 'connected')),
	CONSTRAINT "coop_rooms_protocol_version" CHECK("coop_rooms"."protocol_version" BETWEEN 1 AND 9999),
	CONSTRAINT "coop_rooms_build_id_length" CHECK(length("coop_rooms"."build_id") BETWEEN 1 AND 64),
	CONSTRAINT "coop_rooms_signal_count" CHECK("coop_rooms"."signal_count" BETWEEN 0 AND 128)
);
--> statement-breakpoint
CREATE INDEX `coop_rooms_expires_idx` ON `coop_rooms` (`expires_at`);--> statement-breakpoint
CREATE TABLE `coop_signals` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`room_id` text NOT NULL,
	`sender` text NOT NULL,
	`kind` text NOT NULL,
	`client_seq` integer NOT NULL,
	`payload` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`room_id`) REFERENCES `coop_rooms`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "coop_signals_sender" CHECK("coop_signals"."sender" IN ('host', 'guest')),
	CONSTRAINT "coop_signals_kind" CHECK("coop_signals"."kind" IN ('description', 'candidate', 'ready', 'connected', 'bye')),
	CONSTRAINT "coop_signals_client_seq" CHECK("coop_signals"."client_seq" BETWEEN 0 AND 2147483647),
	CONSTRAINT "coop_signals_payload_length" CHECK(length("coop_signals"."payload") BETWEEN 1 AND 32768)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `coop_signals_sender_seq_uq` ON `coop_signals` (`room_id`,`sender`,`client_seq`);--> statement-breakpoint
CREATE INDEX `coop_signals_room_cursor_idx` ON `coop_signals` (`room_id`,`id`);--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_leaderboard_entries` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`run_id` text NOT NULL,
	`player_name` text NOT NULL,
	`score` integer NOT NULL,
	`wave` integer NOT NULL,
	`kills` integer NOT NULL,
	`pant_id` text NOT NULL,
	`mode` text DEFAULT 'solo' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	CONSTRAINT "leaderboard_name_length" CHECK(length("__new_leaderboard_entries"."player_name") BETWEEN 2 AND 18),
	CONSTRAINT "leaderboard_score_range" CHECK("__new_leaderboard_entries"."score" BETWEEN 0 AND 1000000000),
	CONSTRAINT "leaderboard_wave_range" CHECK("__new_leaderboard_entries"."wave" BETWEEN 1 AND 9999),
	CONSTRAINT "leaderboard_kills_range" CHECK("__new_leaderboard_entries"."kills" BETWEEN 0 AND 10000000),
	CONSTRAINT "leaderboard_mode" CHECK("__new_leaderboard_entries"."mode" IN ('solo', 'coop'))
);
--> statement-breakpoint
INSERT INTO `__new_leaderboard_entries`("id", "run_id", "player_name", "score", "wave", "kills", "pant_id", "mode", "created_at") SELECT "id", "run_id", "player_name", "score", "wave", "kills", "pant_id", 'solo', "created_at" FROM `leaderboard_entries`;--> statement-breakpoint
DROP TABLE `leaderboard_entries`;--> statement-breakpoint
ALTER TABLE `__new_leaderboard_entries` RENAME TO `leaderboard_entries`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE UNIQUE INDEX `leaderboard_run_id_uq` ON `leaderboard_entries` (`run_id`);--> statement-breakpoint
CREATE INDEX `leaderboard_rank_idx` ON `leaderboard_entries` (`score`,`wave`,`kills`);
