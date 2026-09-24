DROP INDEX `idx_library_user_game`;--> statement-breakpoint
ALTER TABLE `library_items` ADD `platform_id` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `library_items` ADD `platform_name` text;--> statement-breakpoint
CREATE UNIQUE INDEX `idx_library_user_game_platform` ON `library_items` (`user_id`,`igdb_id`,`platform_id`);