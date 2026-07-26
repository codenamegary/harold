CREATE TABLE `agent_settings` (
	`agent_id` text PRIMARY KEY NOT NULL,
	`enabled` integer DEFAULT false NOT NULL,
	`path` text,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
INSERT INTO `agent_settings` (`agent_id`, `enabled`, `path`, `updated_at`) VALUES ('cursor', 0, NULL, datetime('now'));
--> statement-breakpoint
INSERT INTO `agent_settings` (`agent_id`, `enabled`, `path`, `updated_at`) VALUES ('claude', 0, NULL, datetime('now'));
