import { AgentId } from "contracts/http/agent-settings"
import { AgentProfile, resolveAgentProfile } from "../agent-profile"
import { AgentSettingsReader } from "./models"

export type ResolvedStartConfig =
  | { ok: false; reason: string }
  | {
      ok: true
      profile: AgentProfile
      executablePath: string
      args: string[]
    }

/**
 * Pure decision for whether an agent can start: profile from the catalog or a
 * persisted spawn snapshot, then enabled and executable-path gates from the
 * agent settings.
 */
export const resolveStartConfig = (
  repository: AgentSettingsReader,
  agentId: AgentId,
): ResolvedStartConfig => {
  const spawnSnapshot = repository.getSpawnSnapshot?.(agentId) ?? null
  const profile = resolveAgentProfile(agentId, spawnSnapshot)
  if (!profile) {
    return { ok: false, reason: "Agent profile is not available" }
  }

  const settings = repository.list().find((agent) => agent.id === agentId)
  if (!settings?.enabled) {
    return { ok: false, reason: "Agent is not enabled" }
  }

  if (!settings.path) {
    return { ok: false, reason: "Agent executable path is not configured" }
  }

  return {
    ok: true,
    profile,
    executablePath: settings.path,
    args: settings.args,
  }
}
