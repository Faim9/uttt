CREATE TABLE `puzzle_attempts` (
	`user_id` integer NOT NULL,
	`puzzle_id` integer NOT NULL,
	`solved` integer NOT NULL,
	`at` integer NOT NULL,
	PRIMARY KEY(`user_id`, `puzzle_id`),
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`puzzle_id`) REFERENCES `puzzles`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `puzzles` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`position` text NOT NULL,
	`line` text NOT NULL,
	`win_in` integer NOT NULL,
	`rating` real NOT NULL,
	`deviation` real NOT NULL,
	`volatility` real NOT NULL,
	`plays` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `puzzles_position_unique` ON `puzzles` (`position`);--> statement-breakpoint
CREATE INDEX `puzzles_rating` ON `puzzles` (`rating`);