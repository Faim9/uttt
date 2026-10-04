CREATE TABLE `tournament_players` (
	`tournament_id` text NOT NULL,
	`user_id` integer NOT NULL,
	`joined_at` integer NOT NULL,
	PRIMARY KEY(`tournament_id`, `user_id`),
	FOREIGN KEY (`tournament_id`) REFERENCES `tournaments`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `tournaments` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`time_control` text NOT NULL,
	`rated` integer NOT NULL,
	`starts_at` integer NOT NULL,
	`ends_at` integer NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `tournaments_starts` ON `tournaments` (`starts_at`);--> statement-breakpoint
ALTER TABLE `games` ADD `tournament_id` text;--> statement-breakpoint
CREATE INDEX `games_tournament` ON `games` (`tournament_id`);