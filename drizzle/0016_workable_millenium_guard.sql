CREATE TABLE `steam_connections` (
	`user_id` text PRIMARY KEY NOT NULL,
	`connection_id` text NOT NULL,
	`steam_id` text NOT NULL,
	`linked_at` integer NOT NULL,
	`synced_at` integer,
	`attempted_at` integer,
	`lock_token` text,
	`lock_until` integer,
	`recent_json` text,
	`activity_at` integer,
	`sync_error` text,
	FOREIGN KEY (`user_id`) REFERENCES `accounts`(`user_id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `steam_connections_connection_id_unique` ON `steam_connections` (`connection_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `steam_connections_steam_id_unique` ON `steam_connections` (`steam_id`);--> statement-breakpoint
CREATE TABLE `steam_games` (
	`connection_id` text NOT NULL,
	`app_id` integer NOT NULL,
	`name` text NOT NULL,
	`playtime_minutes` integer,
	`recent_minutes` integer,
	`last_played_at` integer,
	`observed_at` integer NOT NULL,
	`matched_at` integer,
	`game_json` text,
	`ignored` integer DEFAULT false NOT NULL,
	`imported_at` integer,
	`library_item_id` integer,
	PRIMARY KEY(`connection_id`, `app_id`),
	FOREIGN KEY (`connection_id`) REFERENCES `steam_connections`(`connection_id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`library_item_id`) REFERENCES `library_items`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE TABLE `steam_link_states` (
	`user_id` text PRIMARY KEY NOT NULL,
	`state_hash` text NOT NULL,
	`return_to` text NOT NULL,
	`expires_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `accounts`(`user_id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `steam_mappings` (
	`app_id` integer PRIMARY KEY NOT NULL,
	`candidates_json` text NOT NULL,
	`checked_at` integer NOT NULL
);
