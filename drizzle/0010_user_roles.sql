CREATE TABLE `account_roles` (
	`user_id` text PRIMARY KEY NOT NULL,
	`role` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `accounts`(`user_id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "ck_account_roles_role" CHECK("account_roles"."role" = 'admin')
);
--> statement-breakpoint
-- One-time grant for the verified RGBoner account confirmed in hosted D1.
-- This never grants privileges to a future registration using the same email.
INSERT INTO `account_roles` (`user_id`, `role`)
SELECT `user_id`, 'admin' FROM `accounts`
WHERE `user_id` = '1ffaf3ac-09e4-4e76-912a-c00a3258ff8e'
  AND lower(`email`) = 'alex.florin.popa@gmail.com'
  AND `password_hash` IS NOT NULL
  AND `email_verified_at` IS NOT NULL;
