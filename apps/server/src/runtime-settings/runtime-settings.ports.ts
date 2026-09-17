import { LogLevel, RuntimeSettings } from "contracts/http/runtime-settings"
import { FilesystemPathError } from "../filesystem/filesystem.errors"

export type GetRuntimeSettings = () => RuntimeSettings

export type SaveRuntimeSettings = (next: RuntimeSettings) => RuntimeSettings

export type CanonicalizeAllowedRootsResult =
  | { ok: true; canonicalRoots: string[] }
  | { ok: false; error: FilesystemPathError; index: number }

export type CanonicalizeAllowedRoots = (
  roots: readonly string[],
) => CanonicalizeAllowedRootsResult

export type OnLogLevelChanged = (logLevel: LogLevel) => void
