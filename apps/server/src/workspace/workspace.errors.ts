import { FilesystemPathError } from "../filesystem/filesystem.errors"

export type WorkspaceRepositoryError =
  | { kind: "path"; error: FilesystemPathError }
  | { kind: "outside_allowed_root" }
  | { kind: "not_found" }
  | { kind: "duplicate_path" }
