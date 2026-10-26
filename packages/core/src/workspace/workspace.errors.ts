import { FilesystemPathError } from "../filesystem/filesystem.errors"

export type WorkspaceRepositoryError =
  | { kind: "path"; error: FilesystemPathError }
  | { kind: "not_found" }
  | { kind: "duplicate_path" }

export type RegisterWorkspaceError =
  | WorkspaceRepositoryError
  | { kind: "invalid_git_url" }
  | { kind: "destination_not_empty" }
  | { kind: "clone_failed"; detail: string }
