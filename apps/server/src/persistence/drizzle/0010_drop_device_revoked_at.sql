UPDATE `pairing_codes` SET `device_id` = NULL WHERE `device_id` IN (SELECT `id` FROM `devices` WHERE `revoked_at` IS NOT NULL);--> statement-breakpoint
DELETE FROM `devices` WHERE `revoked_at` IS NOT NULL;--> statement-breakpoint
DROP INDEX `devices_revoked_at_idx`;--> statement-breakpoint
ALTER TABLE `devices` DROP COLUMN `revoked_at`;