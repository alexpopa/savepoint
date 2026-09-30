CREATE INDEX `idx_game_ratings_user_rated_at` ON `game_ratings` (`user_id`,`rated_at`);--> statement-breakpoint
CREATE INDEX `idx_library_user_added_at` ON `library_items` (`user_id`,`added_at`);--> statement-breakpoint
CREATE INDEX `idx_library_user_playing_since` ON `library_items` (`user_id`,`playing_since`) WHERE "library_items"."playing_since" IS NOT NULL;--> statement-breakpoint
CREATE INDEX `idx_library_user_completed_at` ON `library_items` (`user_id`,`completed_at`) WHERE "library_items"."completed_at" IS NOT NULL;