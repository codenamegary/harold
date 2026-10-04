import { FilesystemPathError } from "core/filesystem/errors"

export type UpdateRuntimeSettingsError =
  | {
      readonly kind: "invalid_allowed_root"
      readonly error: FilesystemPathError
      readonly index: number
    }
  | {
      readonly kind: "allowed_root_has_workspaces"
      readonly detail: string
    }
  | { readonly kind: "workspace_not_found" }
