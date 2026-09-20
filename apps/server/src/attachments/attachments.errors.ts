export type SaveAttachmentError = { kind: "empty_name" } | { kind: "blocked_extension" }

export type DeleteAttachmentError = { kind: "invalid_attachment_id" } | { kind: "not_found" }
