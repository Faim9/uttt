CREATE TABLE `feedback` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` integer,
	`kind` text NOT NULL,
	`text` text NOT NULL,
	`created_at` integer NOT NULL,
	`done_at` integer,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `feedback_user` ON `feedback` (`user_id`);--> statement-breakpoint
CREATE INDEX `feedback_open` ON `feedback` (`done_at`);