CREATE TABLE `event_games` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`event_id` integer NOT NULL,
	`user_id` text NOT NULL,
	`library_item_id` integer,
	`igdb_id` integer NOT NULL,
	`platform_id` integer NOT NULL,
	`platform_name` text,
	`name` text NOT NULL,
	`cover_url` text,
	`auto_minutes` integer DEFAULT 0 NOT NULL,
	`adjust_minutes` integer DEFAULT 0 NOT NULL,
	`auto_beaten_at` integer,
	`auto_completed_at` integer,
	`beaten` integer,
	`completed` integer,
	`achievements` integer DEFAULT 0 NOT NULL,
	`removed` integer DEFAULT false NOT NULL,
	`added_at` integer NOT NULL,
	FOREIGN KEY (`event_id`) REFERENCES `events`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `accounts`(`user_id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`library_item_id`) REFERENCES `library_items`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_event_games_player_game` ON `event_games` (`event_id`,`user_id`,`igdb_id`,`platform_id`);--> statement-breakpoint
CREATE TABLE `event_hosts` (
	`event_id` integer NOT NULL,
	`user_id` text NOT NULL,
	PRIMARY KEY(`event_id`, `user_id`),
	FOREIGN KEY (`event_id`) REFERENCES `events`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `accounts`(`user_id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_event_hosts_user` ON `event_hosts` (`user_id`);--> statement-breakpoint
CREATE TABLE `event_members` (
	`event_id` integer NOT NULL,
	`user_id` text NOT NULL,
	`status` text NOT NULL,
	`invited_by` text,
	`invited_at` integer,
	`joined_at` integer,
	`baseline_at` integer,
	`baseline_json` text,
	`updated_at` integer,
	PRIMARY KEY(`event_id`, `user_id`),
	FOREIGN KEY (`event_id`) REFERENCES `events`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `accounts`(`user_id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`invited_by`) REFERENCES `accounts`(`user_id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "ck_event_members_status" CHECK("event_members"."status" IN ('invited', 'joined', 'left'))
);
--> statement-breakpoint
CREATE INDEX `idx_event_members_user` ON `event_members` (`user_id`,`status`);--> statement-breakpoint
CREATE TABLE `event_multipliers` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`event_id` integer NOT NULL,
	`kind` text NOT NULL,
	`target_id` integer NOT NULL,
	`name` text NOT NULL,
	`cover_url` text,
	`hour_points` integer NOT NULL,
	`beaten_points` integer NOT NULL,
	`completed_points` integer NOT NULL,
	FOREIGN KEY (`event_id`) REFERENCES `events`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "ck_event_multipliers_kind" CHECK("event_multipliers"."kind" IN ('platform', 'game'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_event_multipliers_target` ON `event_multipliers` (`event_id`,`kind`,`target_id`);--> statement-breakpoint
CREATE TABLE `events` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`owner_id` text NOT NULL,
	`name` text NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`rules` text DEFAULT '' NOT NULL,
	`visibility` text NOT NULL,
	`start_day` text NOT NULL,
	`end_day` text NOT NULL,
	`time_zone` text NOT NULL,
	`starts_at` integer NOT NULL,
	`ends_at` integer NOT NULL,
	`hour_points` integer DEFAULT 10 NOT NULL,
	`beaten_points` integer DEFAULT 10 NOT NULL,
	`completed_points` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`owner_id`) REFERENCES `accounts`(`user_id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "ck_events_visibility" CHECK("events"."visibility" IN ('public', 'private')),
	CONSTRAINT "ck_events_dates" CHECK("events"."starts_at" < "events"."ends_at")
);
--> statement-breakpoint
CREATE INDEX `idx_events_starts_at` ON `events` (`starts_at`);