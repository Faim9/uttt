ALTER TABLE `games` ADD `x_bot` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `games` ADD `o_bot` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `users` ADD `bot` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `users` ADD `api_token_hash` text;--> statement-breakpoint
CREATE UNIQUE INDEX `users_apiTokenHash_unique` ON `users` (`api_token_hash`);