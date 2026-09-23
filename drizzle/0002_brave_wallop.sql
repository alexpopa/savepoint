CREATE TABLE `challenges` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`recipient_id` text NOT NULL,
	`creator_id` text NOT NULL,
	`igdb_id` integer NOT NULL,
	`game_name` text NOT NULL,
	`game_cover_url` text,
	`title` text NOT NULL,
	`description` text NOT NULL,
	`created_at` integer NOT NULL,
	`creator_confirmed` integer DEFAULT false NOT NULL,
	`recipient_confirmed` integer DEFAULT false NOT NULL,
	`declined_at` integer,
	`is_favorite` integer DEFAULT false NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`recipient_id`) REFERENCES `accounts`(`user_id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`creator_id`) REFERENCES `accounts`(`user_id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "ck_challenge_other_player" CHECK("challenges"."creator_id" <> "challenges"."recipient_id")
);
--> statement-breakpoint
CREATE INDEX `idx_challenges_recipient_game` ON `challenges` (`recipient_id`,`igdb_id`);--> statement-breakpoint
CREATE INDEX `idx_challenges_creator` ON `challenges` (`creator_id`);