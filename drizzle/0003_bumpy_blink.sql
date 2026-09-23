CREATE TABLE `sessions` (
	`token_hash` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`expires_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `accounts`(`user_id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_sessions_user_id` ON `sessions` (`user_id`);--> statement-breakpoint
CREATE INDEX `idx_sessions_expires_at` ON `sessions` (`expires_at`);--> statement-breakpoint
DROP INDEX `idx_accounts_email`;--> statement-breakpoint
ALTER TABLE `accounts` ADD `password_hash` text;--> statement-breakpoint
CREATE UNIQUE INDEX `idx_accounts_email_login` ON `accounts` (`email`) WHERE "accounts"."password_hash" IS NOT NULL;