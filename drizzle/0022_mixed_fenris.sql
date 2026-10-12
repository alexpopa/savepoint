CREATE TABLE `ra_achievements` (
	`achievement_id` integer PRIMARY KEY NOT NULL,
	`game_id` integer NOT NULL,
	`set_name` text,
	`title` text NOT NULL,
	`description` text,
	`badge_url` text,
	`points` integer DEFAULT 0 NOT NULL,
	`display_order` integer DEFAULT 0 NOT NULL,
	`rarity` integer,
	`checked_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_ra_achievements_game` ON `ra_achievements` (`game_id`);--> statement-breakpoint
CREATE TABLE `ra_connections` (
	`user_id` text PRIMARY KEY NOT NULL,
	`connection_id` text NOT NULL,
	`ulid` text NOT NULL,
	`username` text NOT NULL,
	`linked_at` integer NOT NULL,
	`synced_at` integer,
	`attempted_at` integer,
	`lock_token` text,
	`lock_until` integer,
	`sync_error` text,
	`sync_paused` integer DEFAULT false NOT NULL,
	`hardcore_points` integer DEFAULT 0 NOT NULL,
	`softcore_points` integer DEFAULT 0 NOT NULL,
	`retro_points` integer DEFAULT 0 NOT NULL,
	`beaten_hardcore` integer DEFAULT 0 NOT NULL,
	`beaten_softcore` integer DEFAULT 0 NOT NULL,
	`mastered` integer DEFAULT 0 NOT NULL,
	`completed` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `accounts`(`user_id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `ra_connections_connection_id_unique` ON `ra_connections` (`connection_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `ra_connections_ulid_unique` ON `ra_connections` (`ulid`);--> statement-breakpoint
CREATE TABLE `ra_games` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`connection_id` text NOT NULL,
	`game_id` integer NOT NULL,
	`subset_ids_json` text DEFAULT '[]' NOT NULL,
	`name` text NOT NULL,
	`console_id` integer NOT NULL,
	`console_name` text NOT NULL,
	`image_url` text,
	`earned` integer DEFAULT 0 NOT NULL,
	`earned_hardcore` integer DEFAULT 0 NOT NULL,
	`total` integer DEFAULT 0 NOT NULL,
	`last_played_at` integer,
	`play_seconds` integer,
	`observed_at` integer NOT NULL,
	`matched_at` integer,
	`game_json` text,
	`imported_at` integer,
	`library_item_id` integer,
	`achievements_synced_count` integer,
	`completed_at` integer,
	`completed_hardcore` integer DEFAULT false NOT NULL,
	FOREIGN KEY (`connection_id`) REFERENCES `ra_connections`(`connection_id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`library_item_id`) REFERENCES `library_items`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_ra_games_connection_game` ON `ra_games` (`connection_id`,`game_id`);--> statement-breakpoint
CREATE INDEX `idx_ra_games_connection_library` ON `ra_games` (`connection_id`,`library_item_id`);--> statement-breakpoint
CREATE INDEX `idx_ra_games_connection_played` ON `ra_games` (`connection_id`,`last_played_at`);--> statement-breakpoint
CREATE INDEX `idx_ra_games_connection_completed` ON `ra_games` (`connection_id`,`completed_at`) WHERE "ra_games"."completed_at" IS NOT NULL;--> statement-breakpoint
CREATE TABLE `ra_link_codes` (
	`user_id` text PRIMARY KEY NOT NULL,
	`ulid` text NOT NULL,
	`username` text NOT NULL,
	`code` text NOT NULL,
	`expires_at` integer NOT NULL,
	`checked_at` integer,
	FOREIGN KEY (`user_id`) REFERENCES `accounts`(`user_id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `ra_mappings` (
	`game_id` integer PRIMARY KEY NOT NULL,
	`candidates_json` text NOT NULL,
	`checked_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `ra_unlocks` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`game_row_id` integer NOT NULL,
	`user_id` text NOT NULL,
	`achievement_id` integer NOT NULL,
	`earned_at` integer NOT NULL,
	`hardcore` integer DEFAULT false NOT NULL,
	FOREIGN KEY (`game_row_id`) REFERENCES `ra_games`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `accounts`(`user_id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_ra_unlocks_game_achievement` ON `ra_unlocks` (`game_row_id`,`achievement_id`);--> statement-breakpoint
CREATE INDEX `idx_ra_unlocks_user_earned_at` ON `ra_unlocks` (`user_id`,`earned_at`);