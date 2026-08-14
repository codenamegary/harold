CREATE TABLE `archived_acp_sessions` (
	`agent_id` text NOT NULL,
	`session_id` text NOT NULL,
	PRIMARY KEY(`agent_id`, `session_id`)
);
