CREATE TABLE `session_worktree_path` (
	`agent_id` text NOT NULL,
	`session_id` text NOT NULL,
	`worktree_path` text NOT NULL,
	`updated_at` text NOT NULL,
	PRIMARY KEY(`agent_id`, `session_id`)
);
