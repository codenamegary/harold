export type SaveAttachmentError = { kind: "empty_name" } | { kind: "blocked_extension" }

export type DeleteAttachmentError = { kind: "invalid_attachment_id" } | { kind: "not_found" }

export type ResolveSessionFolderError =
  | { kind: "unknown_session" }
  | { kind: "folder_unavailable" }
  | { kind: "outside_allowed_roots" }
