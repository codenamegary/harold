export type AgentSettingsError =
  | { kind: "not_found" }
  | { kind: "cannot_enable" }
  | { kind: "cannot_rename" }
  | { kind: "cannot_delete" }
  | { kind: "id_conflict" }
  | { kind: "path_not_found" }
  | { kind: "path_auto_detect_failed" }
  | { kind: "path_invalid"; path: string }
  | { kind: "registry_fetch_failed" }

export type AgentSettingsResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: AgentSettingsError }
