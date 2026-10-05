ALTER TABLE `tournaments` ADD `created_by` integer REFERENCES users(id) ON DELETE set null;--> statement-breakpoint
ALTER TABLE `tournaments` ADD `official` integer DEFAULT false NOT NULL;--> statement-breakpoint
-- Until now only admins could create tournaments.
UPDATE `tournaments` SET `official` = 1;
