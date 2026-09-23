CREATE TABLE `login_attempts` (
	`email_hash` text PRIMARY KEY NOT NULL,
	`attempts` integer NOT NULL,
	`window_start` integer NOT NULL
);
