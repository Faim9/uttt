CREATE TABLE `correspondence_challenges` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` integer NOT NULL,
	`time_control` text NOT NULL,
	`rated` integer NOT NULL,
	`color` text NOT NULL,
	`listed` integer NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `correspondence_challenges_user` ON `correspondence_challenges` (`user_id`);--> statement-breakpoint
ALTER TABLE `games` ADD `turn_started_at` integer;--> statement-breakpoint
ALTER TABLE `users` ADD `turn_emails` integer DEFAULT true NOT NULL;