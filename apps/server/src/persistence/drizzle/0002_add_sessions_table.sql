CREATE TABLE `sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`agent_id` text NOT NULL,
	`name` text NOT NULL,
	`state` text NOT NULL,
	`acp_session_id` text NOT NULL,
	`created_at` text NOT NULL,
	`last_used_at` text NOT NULL,
	`archived_at` text,
	`resumable` integer DEFAULT false NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade
);
