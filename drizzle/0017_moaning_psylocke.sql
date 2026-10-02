ALTER TABLE `library_items` ADD `updated_at` integer;--> statement-breakpoint
CREATE INDEX `idx_library_user_updated_at` ON `library_items` (`user_id`,`updated_at`,`id`);--> statement-breakpoint
CREATE INDEX `idx_steam_connection_library` ON `steam_games` (`connection_id`,`library_item_id`,`app_id`);