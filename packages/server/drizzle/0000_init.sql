CREATE TABLE `games` (
	`id` text PRIMARY KEY NOT NULL,
	`time_control` text NOT NULL,
	`rated` integer NOT NULL,
	`x_key` text NOT NULL,
	`o_key` text NOT NULL,
	`x_user_id` integer,
	`o_user_id` integer,
	`x_username` text,
	`o_username` text,
	`x_rating` integer,
	`o_rating` integer,
	`x_rating_diff` integer,
	`o_rating_diff` integer,
	`moves` text NOT NULL,
	`x_clock` integer NOT NULL,
	`o_clock` integer NOT NULL,
	`termination` text,
	`outcome` text,
	`created_at` integer NOT NULL,
	`ended_at` integer,
	FOREIGN KEY (`x_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`o_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `games_x_user` ON `games` (`x_user_id`);--> statement-breakpoint
CREATE INDEX `games_o_user` ON `games` (`o_user_id`);--> statement-breakpoint
CREATE INDEX `games_termination` ON `games` (`termination`);--> statement-breakpoint
CREATE TABLE `ratings` (
	`user_id` integer NOT NULL,
	`category` text NOT NULL,
	`rating` real NOT NULL,
	`deviation` real NOT NULL,
	`volatility` real NOT NULL,
	`games` integer NOT NULL,
	`updated_at` integer NOT NULL,
	PRIMARY KEY(`user_id`, `category`),
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `ratings_leaderboard` ON `ratings` (`category`,`rating`);--> statement-breakpoint
CREATE TABLE `sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` integer NOT NULL,
	`expires_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `users` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`username` text NOT NULL,
	`email` text NOT NULL,
	`password_hash` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_email_unique` ON `users` (`email`);--> statement-breakpoint
CREATE UNIQUE INDEX `users_username_lower` ON `users` (lower("username"));