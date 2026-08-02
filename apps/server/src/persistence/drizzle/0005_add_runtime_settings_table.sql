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
