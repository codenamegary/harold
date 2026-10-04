import { LogLevel, RuntimeSettings } from "contracts/http/runtime-settings"
import { CanonicalizePathResult } from "core/filesystem/ports"

export type GetRuntimeSettings = () => RuntimeSettings

export type SaveRuntimeSettings = (next: RuntimeSettings) => RuntimeSettings

export type CanonicalizePath = (inputPath: string) => CanonicalizePathResult

export type OnLogLevelChanged = (logLevel: LogLevel) => void
