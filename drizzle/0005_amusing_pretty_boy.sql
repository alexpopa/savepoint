CREATE TABLE `auth_tokens` (
	`token_hash` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`purpose` text NOT NULL,
	`created_at` integer NOT NULL,
	`expires_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `accounts`(`user_id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_auth_tokens_user_purpose` ON `auth_tokens` (`user_id`,`purpose`);--> statement-breakpoint
CREATE INDEX `idx_auth_tokens_expires_at` ON `auth_tokens` (`expires_at`);--> statement-breakpoint
ALTER TABLE `accounts` ADD `email_verified_at` integer;