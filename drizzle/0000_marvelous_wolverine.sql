CREATE TABLE `library_items` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` text NOT NULL,
	`igdb_id` integer NOT NULL,
	`name` text NOT NULL,
	`cover_url` text,
	`release_year` integer,
	`platforms_json` text DEFAULT '[]' NOT NULL,
	`added_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_library_user_game` ON `library_items` (`user_id`,`igdb_id`);