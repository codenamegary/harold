import { AgentId } from "contracts/http/agent-settings"
import { AcpSupervisor } from "../acp/supervisor/models"
import { AgentSettingsRepository } from "../agent-settings/agent-settings-repository"

export type StartEnabledAgentsLog = {
  info: (obj: object, msg: string) => void
  warn: (obj: object, msg: string) => void
}

export type StartEnabledAgentResult =
  | { agentId: AgentId; ok: true }
  | { agentId: AgentId; ok: false; error: unknown }

export const startEnabledAgents = async (
  agentSettingsRepository: Pick<AgentSettingsRepository, "list">,
  acpSupervisor: Pick<AcpSupervisor, "start">,
  log: StartEnabledAgentsLog,
): Promise<ReadonlyArray<StartEnabledAgentResult>> => {
  const enabledIds = agentSettingsRepository
    .list()
    .filter((agent) => agent.enabled)
    .map((agent) => agent.id)

  if (enabledIds.length === 0) {
    return []
  }

  log.info({ agentIds: enabledIds }, "starting enabled ACP agents")

  const results = await Promise.all(
    enabledIds.map(async (agentId): Promise<StartEnabledAgentResult> => {
      try {
        await acpSupervisor.start(agentId)
        return { agentId, ok: true }
      } catch (error: unknown) {
        return { agentId, ok: false, error }
      }
    }),
  )

  results.forEach((result) => {
    if (result.ok) {
      log.info({ agentId: result.agentId }, "enabled ACP agent ready")
      return
    }

    log.warn(
      { agentId: result.agentId, err: result.error },
      "failed to start enabled ACP agent",
    )
  })

  return results
}
