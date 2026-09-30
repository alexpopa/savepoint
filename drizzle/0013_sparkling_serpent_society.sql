CREATE TABLE `game_ratings` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` text NOT NULL,
	`igdb_id` integer NOT NULL,
	`name` text NOT NULL,
	`cover_url` text,
	`release_year` integer,
	`score` integer NOT NULL,
	`rated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `accounts`(`user_id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "ck_game_ratings_score" CHECK("game_ratings"."score" BETWEEN 1 AND 5)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_game_ratings_user_game` ON `game_ratings` (`user_id`,`igdb_id`);--> statement-breakpoint
ALTER TABLE `library_items` ADD `completed_at` integer;