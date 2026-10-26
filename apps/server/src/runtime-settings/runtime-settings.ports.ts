import { LogLevel, RuntimeSettings } from "contracts/http/runtime-settings"

export type GetRuntimeSettings = () => RuntimeSettings

export type SaveRuntimeSettings = (next: RuntimeSettings) => RuntimeSettings

export type OnLogLevelChanged = (logLevel: LogLevel) => void
