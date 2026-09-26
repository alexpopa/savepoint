CREATE TABLE `game_favorites` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` text NOT NULL,
	`igdb_id` integer NOT NULL,
	`name` text NOT NULL,
	`cover_url` text,
	`release_year` integer,
	`favorited_at` integer NOT NULL,
	`sort_order` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `accounts`(`user_id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_game_favorites_user_game` ON `game_favorites` (`user_id`,`igdb_id`);