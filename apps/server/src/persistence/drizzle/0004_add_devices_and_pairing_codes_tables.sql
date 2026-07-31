CREATE TABLE `devices` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`platform` text,
	`credential_hash` text NOT NULL,
	`paired_at` text NOT NULL,
	`last_seen_at` text,
	`revoked_at` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `devices_credential_hash_unique` ON `devices` (`credential_hash`);--> statement-breakpoint
CREATE INDEX `devices_revoked_at_idx` ON `devices` (`revoked_at`);--> statement-breakpoint
CREATE TABLE `pairing_codes` (
	`id` text PRIMARY KEY NOT NULL,
	`code_hash` text NOT NULL,
	`state` text NOT NULL,
	`created_at` text NOT NULL,
	`expires_at` text NOT NULL,
	`claimed_at` text,
	`device_id` text,
	FOREIGN KEY (`device_id`) REFERENCES `devices`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "pairing_codes_state_valid" CHECK("pairing_codes"."state" IN ('active', 'claimed', 'expired', 'revoked'))
);
--> statement-breakpoint
CREATE INDEX `pairing_codes_state_expires_at_idx` ON `pairing_codes` (`state`,`expires_at`);--> statement-breakpoint
CREATE INDEX `pairing_codes_device_id_idx` ON `pairing_codes` (`device_id`);