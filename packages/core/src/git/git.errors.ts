import { FilesystemPathError } from "../filesystem/filesystem.errors"
import { GitCommandFailure } from "./git.ports"

export type GitOperationError =
  | { kind: "path"; error: FilesystemPathError }
  | { kind: "invalid_path"; detail: string; pointer: "#/file" | "#/oldPath" }
  | { kind: "not_git_repository" }
  | { kind: "not_found"; detail: string }
  | { kind: "branch_unavailable"; detail: string }
  | { kind: "git_unavailable" }
  | { kind: "git_failed"; detail: string }

export type GitOperationResult<T> = { ok: true; value: T } | { ok: false; error: GitOperationError }

export const fromGitCommandFailure = (error: GitCommandFailure): GitOperationError =>
  error.kind === "unavailable"
    ? { kind: "git_unavailable" }
    : { kind: "git_failed", detail: error.detail }
