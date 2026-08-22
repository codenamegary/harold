export type WorkspacePathError =
  | { kind: "missing" }
  | { kind: "not_directory" }
  | { kind: "unreadable" }

export type WorkspaceRepositoryError =
  | { kind: "path"; error: WorkspacePathError }
  | { kind: "outside_allowed_root" }
  | { kind: "not_found" }
  | { kind: "duplicate_path" }
