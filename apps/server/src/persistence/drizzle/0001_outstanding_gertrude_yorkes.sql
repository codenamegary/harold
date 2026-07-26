CREATE TABLE `agent_settings` (
	`agent_id` text PRIMARY KEY NOT NULL,
	`enabled` integer DEFAULT false NOT NULL,
	`path_override` text,
	`detected_path` text,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
INSERT INTO `agent_settings` (`agent_id`, `enabled`, `path_override`, `detected_path`, `updated_at`) VALUES ('cursor', 0, NULL, NULL, datetime('now'));
--> statement-breakpoint
INSERT INTO `agent_settings` (`agent_id`, `enabled`, `path_override`, `detected_path`, `updated_at`) VALUES ('claude', 0, NULL, NULL, datetime('now'));
