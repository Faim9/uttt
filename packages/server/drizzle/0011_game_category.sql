ALTER TABLE `games` ADD `category` text DEFAULT 'blitz' NOT NULL;--> statement-breakpoint
CREATE INDEX `games_x_created` ON `games` (`x_user_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `games_o_created` ON `games` (`o_user_id`,`created_at`);--> statement-breakpoint
-- Existing games get the category of their time control, as categoryOf() computes it (about 25 moves each).
UPDATE `games` SET `category` = CASE
  WHEN `time_control` LIKE '%d' THEN 'correspondence'
  WHEN CAST(substr(`time_control`, 1, instr(`time_control`, '+') - 1) AS INTEGER) * 60
    + 25 * CAST(substr(`time_control`, instr(`time_control`, '+') + 1) AS INTEGER) < 180 THEN 'bullet'
  WHEN CAST(substr(`time_control`, 1, instr(`time_control`, '+') - 1) AS INTEGER) * 60
    + 25 * CAST(substr(`time_control`, instr(`time_control`, '+') + 1) AS INTEGER) < 480 THEN 'blitz'
  ELSE 'rapid'
END;
