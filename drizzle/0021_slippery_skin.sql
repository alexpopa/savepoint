CREATE TABLE `psn_connections` (
	`user_id` text PRIMARY KEY NOT NULL,
	`connection_id` text NOT NULL,
	`account_id` text NOT NULL,
	`online_id` text NOT NULL,
	`token_cipher` text NOT NULL,
	`linked_at` integer NOT NULL,
	`synced_at` integer,
	`attempted_at` integer,
	`lock_token` text,
	`lock_until` integer,
	`sync_error` text,
	`sync_paused` integer DEFAULT false NOT NULL,
	`needs_reconnect` integer DEFAULT false NOT NULL,
	`trophy_level` integer,
	`earned_platinum` integer DEFAULT 0 NOT NULL,
	`earned_gold` integer DEFAULT 0 NOT NULL,
	`earned_silver` integer DEFAULT 0 NOT NULL,
	`earned_bronze` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `accounts`(`user_id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `psn_connections_connection_id_unique` ON `psn_connections` (`connection_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `psn_connections_account_id_unique` ON `psn_connections` (`account_id`);--> statement-breakpoint
CREATE TABLE `psn_mappings` (
	`title_key` text PRIMARY KEY NOT NULL,
	`candidates_json` text NOT NULL,
	`checked_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `psn_titles` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`connection_id` text NOT NULL,
	`title_key` text NOT NULL,
	`name` text NOT NULL,
	`image_url` text,
	`platforms_json` text DEFAULT '[]' NOT NULL,
	`np_communication_id` text,
	`np_service_name` text,
	`concept_id` integer,
	`title_ids_json` text DEFAULT '[]' NOT NULL,
	`links_checked` integer DEFAULT false NOT NULL,
	`last_played_at` integer,
	`play_seconds` integer,
	`earned_platinum` integer DEFAULT 0 NOT NULL,
	`earned_gold` integer DEFAULT 0 NOT NULL,
	`earned_silver` integer DEFAULT 0 NOT NULL,
	`earned_bronze` integer DEFAULT 0 NOT NULL,
	`defined_platinum` integer DEFAULT 0 NOT NULL,
	`defined_gold` integer DEFAULT 0 NOT NULL,
	`defined_silver` integer DEFAULT 0 NOT NULL,
	`defined_bronze` integer DEFAULT 0 NOT NULL,
	`progress` integer DEFAULT 0 NOT NULL,
	`observed_at` integer NOT NULL,
	`matched_at` integer,
	`game_json` text,
	`imported_at` integer,
	`library_item_id` integer,
	`trophies_synced_count` integer,
	`completed_at` integer,
	FOREIGN KEY (`connection_id`) REFERENCES `psn_connections`(`connection_id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`library_item_id`) REFERENCES `library_items`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_psn_titles_connection_title` ON `psn_titles` (`connection_id`,`title_key`);--> statement-breakpoint
CREATE INDEX `idx_psn_titles_connection_library` ON `psn_titles` (`connection_id`,`library_item_id`);--> statement-breakpoint
CREATE INDEX `idx_psn_titles_connection_played` ON `psn_titles` (`connection_id`,`last_played_at`);--> statement-breakpoint
CREATE INDEX `idx_psn_titles_connection_completed` ON `psn_titles` (`connection_id`,`completed_at`) WHERE "psn_titles"."completed_at" IS NOT NULL;--> statement-breakpoint
CREATE TABLE `psn_trophies` (
	`np_communication_id` text NOT NULL,
	`trophy_id` integer NOT NULL,
	`group_id` text DEFAULT 'default' NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`icon_url` text,
	`grade` text NOT NULL,
	`is_hidden` integer DEFAULT false NOT NULL,
	`rarity` integer,
	`checked_at` integer NOT NULL,
	PRIMARY KEY(`np_communication_id`, `trophy_id`)
);
--> statement-breakpoint
CREATE TABLE `psn_unlocks` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`title_row_id` integer NOT NULL,
	`user_id` text NOT NULL,
	`trophy_id` integer NOT NULL,
	`earned_at` integer NOT NULL,
	FOREIGN KEY (`title_row_id`) REFERENCES `psn_titles`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `accounts`(`user_id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_psn_unlocks_title_trophy` ON `psn_unlocks` (`title_row_id`,`trophy_id`);--> statement-breakpoint
CREATE INDEX `idx_psn_unlocks_user_earned_at` ON `psn_unlocks` (`user_id`,`earned_at`);