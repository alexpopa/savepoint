CREATE TABLE `xbox_achievements` (
	`title_id` integer NOT NULL,
	`achievement_id` text NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`locked_description` text,
	`icon_url` text,
	`gamerscore` integer DEFAULT 0 NOT NULL,
	`is_secret` integer DEFAULT false NOT NULL,
	`rarity` integer,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`checked_at` integer NOT NULL,
	PRIMARY KEY(`title_id`, `achievement_id`)
);
--> statement-breakpoint
CREATE TABLE `xbox_connections` (
	`user_id` text PRIMARY KEY NOT NULL,
	`connection_id` text NOT NULL,
	`xuid` text NOT NULL,
	`gamertag` text NOT NULL,
	`token_cipher` text NOT NULL,
	`linked_at` integer NOT NULL,
	`synced_at` integer,
	`attempted_at` integer,
	`lock_token` text,
	`lock_until` integer,
	`sync_error` text,
	FOREIGN KEY (`user_id`) REFERENCES `accounts`(`user_id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `xbox_connections_connection_id_unique` ON `xbox_connections` (`connection_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `xbox_connections_xuid_unique` ON `xbox_connections` (`xuid`);--> statement-breakpoint
CREATE TABLE `xbox_link_states` (
	`user_id` text PRIMARY KEY NOT NULL,
	`state_hash` text NOT NULL,
	`verifier` text NOT NULL,
	`expires_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `accounts`(`user_id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `xbox_mappings` (
	`title_id` integer PRIMARY KEY NOT NULL,
	`candidates_json` text NOT NULL,
	`checked_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `xbox_titles` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`connection_id` text NOT NULL,
	`title_id` integer NOT NULL,
	`name` text NOT NULL,
	`image_url` text,
	`product_id` text,
	`devices_json` text DEFAULT '[]' NOT NULL,
	`last_played_at` integer,
	`current_achievements` integer DEFAULT 0 NOT NULL,
	`total_achievements` integer DEFAULT 0 NOT NULL,
	`current_gamerscore` integer DEFAULT 0 NOT NULL,
	`total_gamerscore` integer DEFAULT 0 NOT NULL,
	`achievement_version` integer DEFAULT 2 NOT NULL,
	`observed_at` integer NOT NULL,
	`matched_at` integer,
	`game_json` text,
	`imported_at` integer,
	`library_item_id` integer,
	`achievements_synced_count` integer,
	`completed_at` integer,
	FOREIGN KEY (`connection_id`) REFERENCES `xbox_connections`(`connection_id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`library_item_id`) REFERENCES `library_items`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_xbox_titles_connection_title` ON `xbox_titles` (`connection_id`,`title_id`);--> statement-breakpoint
CREATE INDEX `idx_xbox_titles_connection_library` ON `xbox_titles` (`connection_id`,`library_item_id`);--> statement-breakpoint
CREATE INDEX `idx_xbox_titles_connection_played` ON `xbox_titles` (`connection_id`,`last_played_at`);--> statement-breakpoint
CREATE INDEX `idx_xbox_titles_connection_completed` ON `xbox_titles` (`connection_id`,`completed_at`) WHERE "xbox_titles"."completed_at" IS NOT NULL;--> statement-breakpoint
CREATE TABLE `xbox_unlocks` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`title_row_id` integer NOT NULL,
	`user_id` text NOT NULL,
	`achievement_id` text NOT NULL,
	`unlocked_at` integer NOT NULL,
	FOREIGN KEY (`title_row_id`) REFERENCES `xbox_titles`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `accounts`(`user_id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_xbox_unlocks_title_achievement` ON `xbox_unlocks` (`title_row_id`,`achievement_id`);--> statement-breakpoint
CREATE INDEX `idx_xbox_unlocks_user_unlocked_at` ON `xbox_unlocks` (`user_id`,`unlocked_at`);