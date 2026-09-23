CREATE TABLE `accounts` (
	`user_id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`display_name` text NOT NULL,
	`is_public` integer DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_accounts_email` ON `accounts` (`email`);--> statement-breakpoint
CREATE TABLE `friendships` (
	`user_low` text NOT NULL,
	`user_high` text NOT NULL,
	`requester_id` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`created_at` integer NOT NULL,
	PRIMARY KEY(`user_low`, `user_high`),
	FOREIGN KEY (`user_low`) REFERENCES `accounts`(`user_id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_high`) REFERENCES `accounts`(`user_id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`requester_id`) REFERENCES `accounts`(`user_id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "ck_friendship_pair" CHECK("friendships"."user_low" < "friendships"."user_high"),
	CONSTRAINT "ck_friendship_requester" CHECK("friendships"."requester_id" = "friendships"."user_low" OR "friendships"."requester_id" = "friendships"."user_high"),
	CONSTRAINT "ck_friendship_status" CHECK("friendships"."status" IN ('pending', 'accepted'))
);
--> statement-breakpoint
CREATE INDEX `idx_friendships_user_high` ON `friendships` (`user_high`);