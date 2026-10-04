CREATE TABLE `blocks` (
	`blocker_id` integer NOT NULL,
	`blocked_id` integer NOT NULL,
	`created_at` integer NOT NULL,
	PRIMARY KEY(`blocker_id`, `blocked_id`),
	FOREIGN KEY (`blocker_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`blocked_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `blocks_blocked` ON `blocks` (`blocked_id`);--> statement-breakpoint
CREATE TABLE `follows` (
	`follower_id` integer NOT NULL,
	`followed_id` integer NOT NULL,
	`created_at` integer NOT NULL,
	PRIMARY KEY(`follower_id`, `followed_id`),
	FOREIGN KEY (`follower_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`followed_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `follows_followed` ON `follows` (`followed_id`);--> statement-breakpoint
CREATE TABLE `rating_history` (
	`user_id` integer NOT NULL,
	`category` text NOT NULL,
	`rating` integer NOT NULL,
	`at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `rating_history_user` ON `rating_history` (`user_id`,`category`,`at`);--> statement-breakpoint
-- Backfill: each rated game's rating after the game, for both players. The category mirrors categoryOf in
-- @uttt/core: from "m+s", the estimated game length is m minutes plus 25 increments of s seconds.
INSERT INTO `rating_history` (`user_id`, `category`, `rating`, `at`)
SELECT `user_id`,
  CASE
    WHEN `seconds` < 180 THEN 'bullet'
    WHEN `seconds` < 480 THEN 'blitz'
    ELSE 'rapid'
  END,
  `rating`, `at`
FROM (
  SELECT `user_id`, `rating`, `at`,
    CAST(substr(`time_control`, 1, instr(`time_control`, '+') - 1) AS INTEGER) * 60
      + 25 * CAST(substr(`time_control`, instr(`time_control`, '+') + 1) AS INTEGER) AS `seconds`
  FROM (
    SELECT `x_user_id` AS `user_id`, `x_rating` + `x_rating_diff` AS `rating`, `ended_at` AS `at`, `time_control`
    FROM `games` WHERE `rated` = 1 AND `x_user_id` IS NOT NULL AND `x_rating_diff` IS NOT NULL
    UNION ALL
    SELECT `o_user_id`, `o_rating` + `o_rating_diff`, `ended_at`, `time_control`
    FROM `games` WHERE `rated` = 1 AND `o_user_id` IS NOT NULL AND `o_rating_diff` IS NOT NULL
  )
);
