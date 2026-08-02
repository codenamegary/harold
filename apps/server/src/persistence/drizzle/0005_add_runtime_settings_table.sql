CREATE TABLE `runtime_settings` (
	`id` integer PRIMARY KEY NOT NULL,
	`advertised_url` text,
	`trusted_proxies_json` text NOT NULL,
	`bind_host` text NOT NULL,
	`bind_port` integer NOT NULL,
	`log_level` text NOT NULL,
	`log_path` text,
	`allowed_roots_json` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
INSERT INTO `runtime_settings` (
	`id`,
	`advertised_url`,
	`trusted_proxies_json`,
	`bind_host`,
	`bind_port`,
	`log_level`,
	`log_path`,
	`allowed_roots_json`,
	`updated_at`
) VALUES (
	1,
	NULL,
	'[]',
	'127.0.0.1',
	3847,
	'info',
	NULL,
	'[]',
	datetime('now')
);
