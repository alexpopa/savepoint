CREATE TABLE `messages` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_low` text NOT NULL,
	`user_high` text NOT NULL,
	`sender_id` text NOT NULL,
	`recipient_id` text NOT NULL,
	`body` text NOT NULL,
	`created_at` integer NOT NULL,
	`read_at` integer,
	FOREIGN KEY (`user_low`) REFERENCES `accounts`(`user_id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_high`) REFERENCES `accounts`(`user_id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`sender_id`) REFERENCES `accounts`(`user_id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`recipient_id`) REFERENCES `accounts`(`user_id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "ck_messages_pair" CHECK("messages"."user_low" < "messages"."user_high"),
	CONSTRAINT "ck_messages_participants" CHECK(("messages"."sender_id" = "messages"."user_low" AND "messages"."recipient_id" = "messages"."user_high") OR ("messages"."sender_id" = "messages"."user_high" AND "messages"."recipient_id" = "messages"."user_low")),
	CONSTRAINT "ck_messages_body" CHECK(length("messages"."body") BETWEEN 1 AND 2000)
);
--> statement-breakpoint
CREATE INDEX `idx_messages_pair_id` ON `messages` (`user_low`,`user_high`,`id`);--> statement-breakpoint
CREATE INDEX `idx_messages_unread` ON `messages` (`recipient_id`,`sender_id`) WHERE "messages"."read_at" IS NULL;