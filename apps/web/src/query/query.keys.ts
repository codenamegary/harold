import { WorkspaceState } from "contracts/http/workspace"

export const queryKeys = {
  status: ["status"] as const,
  workspacesRoot: ["workspaces"] as const,
  workspaces: (filters: { q?: string; state?: WorkspaceState }) =>
    [...queryKeys.workspacesRoot, filters] as const,
  agentSettingsRoot: ["agentSettings"] as const,
  agentSettings: () => [...queryKeys.agentSettingsRoot] as const,
  sessionsRoot: ["sessions"] as const,
  sessions: (workspaceId: string) =>
    [...queryKeys.sessionsRoot, workspaceId] as const,
}
