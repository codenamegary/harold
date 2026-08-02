import { WorkspaceState } from "contracts/http/workspace"
import { DeviceState } from "contracts/http/device"

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
  sessionsRoot: ["sessions"] as const,
  sessions: (workspaceId: string) =>
    [...queryKeys.sessionsRoot, workspaceId] as const,
}
