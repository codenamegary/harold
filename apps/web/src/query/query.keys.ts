import { WorkspaceState } from "contracts/http/workspace"
import { DeviceState } from "contracts/http/device"
import { LogLevel } from "contracts/http/runtime-settings"
import { LogSource } from "contracts/http/logs"

export const queryKeys = {
  status: ["status"] as const,
  workspacesRoot: ["workspaces"] as const,
  workspaces: (filters: { q?: string; state?: WorkspaceState }) =>
    [...queryKeys.workspacesRoot, filters] as const,
  devicesRoot: ["devices"] as const,
  devices: (filters: { state?: DeviceState } = {}) =>
    [...queryKeys.devicesRoot, filters] as const,
  agentSettingsRoot: ["agentSettings"] as const,
  agentSettings: () => [...queryKeys.agentSettingsRoot] as const,
  runtimeSettingsRoot: ["runtimeSettings"] as const,
  runtimeSettings: () => [...queryKeys.runtimeSettingsRoot] as const,
  filesystemDirectoriesRoot: ["filesystemDirectories"] as const,
  filesystemDirectories: (root: string) =>
    [...queryKeys.filesystemDirectoriesRoot, root] as const,
  sessionsRoot: ["sessions"] as const,
  sessions: (workspaceId?: string) =>
    [...queryKeys.sessionsRoot, workspaceId ?? "all"] as const,
  logsRoot: ["logs"] as const,
  logs: (filters: { level?: LogLevel; source?: LogSource } = {}) =>
    [...queryKeys.logsRoot, filters] as const,
}
