CREATE TABLE `events` (
	`cursor` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`schema_version` integer NOT NULL,
	`kind` text NOT NULL,
	`occurred_at` text NOT NULL,
	`workspace_id` text,
	`session_id` text,
	`session_sequence` integer,
	`turn_id` text,
	`protocol_version` integer,
	`direction` text,
	`method` text,
	`phase` text,
	`payload` text NOT NULL,
	CONSTRAINT "events_schema_version_positive" CHECK("events"."schema_version" > 0),
	CONSTRAINT "events_session_sequence_positive" CHECK("events"."session_sequence" IS NULL OR "events"."session_sequence" > 0),
	CONSTRAINT "events_payload_json" CHECK(json_valid("events"."payload"))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `events_session_id_session_sequence_unique` ON `events` (`session_id`,`session_sequence`);
--> statement-breakpoint
CREATE INDEX `events_workspace_id_cursor_idx` ON `events` (`workspace_id`,`cursor`);
--> statement-breakpoint
CREATE INDEX `events_session_id_cursor_idx` ON `events` (`session_id`,`cursor`);
--> statement-breakpoint
CREATE INDEX `events_session_id_session_sequence_idx` ON `events` (`session_id`,`session_sequence`);
--> statement-breakpoint
CREATE INDEX `events_turn_id_cursor_idx` ON `events` (`turn_id`,`cursor`);
