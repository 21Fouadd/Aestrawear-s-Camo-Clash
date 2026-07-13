CREATE TABLE `leaderboard_entries` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`run_id` text NOT NULL,
	`player_name` text NOT NULL,
	`score` integer NOT NULL,
	`wave` integer NOT NULL,
	`kills` integer NOT NULL,
	`pant_id` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	CONSTRAINT "leaderboard_name_length" CHECK(length("leaderboard_entries"."player_name") BETWEEN 2 AND 18),
	CONSTRAINT "leaderboard_score_range" CHECK("leaderboard_entries"."score" BETWEEN 0 AND 1000000000),
	CONSTRAINT "leaderboard_wave_range" CHECK("leaderboard_entries"."wave" BETWEEN 1 AND 9999),
	CONSTRAINT "leaderboard_kills_range" CHECK("leaderboard_entries"."kills" BETWEEN 0 AND 10000000)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `leaderboard_run_id_uq` ON `leaderboard_entries` (`run_id`);--> statement-breakpoint
CREATE INDEX `leaderboard_rank_idx` ON `leaderboard_entries` (`score`,`wave`,`kills`);