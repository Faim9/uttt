CREATE TABLE `audit_log` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`admin` text NOT NULL,
	`action` text NOT NULL,
	`target` text NOT NULL,
	`details` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `reports` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`reporter_id` integer,
	`reported_id` integer NOT NULL,
	`reason` text NOT NULL,
	`details` text NOT NULL,
	`created_at` integer NOT NULL,
	`resolved_at` integer,
	FOREIGN KEY (`reporter_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`reported_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `reports_open` ON `reports` (`resolved_at`);--> statement-breakpoint
ALTER TABLE `users` ADD `closed_at` integer;--> statement-breakpoint
ALTER TABLE `users` ADD `closed_reason` text;