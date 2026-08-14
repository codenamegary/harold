import { AgentId } from "contracts/http/agent-settings"
import { AcpSupervisor } from "../acp/supervisor/acp-supervisor-types"
import { AgentSettingsRepository } from "../agent-settings/agent-settings-repository"

export type StartEnabledAgentsLog = {
  info: (obj: object, msg: string) => void
  warn: (obj: object, msg: string) => void
}

export type StartEnabledAgentsParams = {
  agentSettingsRepository: Pick<AgentSettingsRepository, "list">
  acpSupervisor: Pick<AcpSupervisor, "start">
  log: StartEnabledAgentsLog
}

export type StartEnabledAgentResult =
  | { agentId: AgentId; ok: true }
  | { agentId: AgentId; ok: false; error: unknown }

export const startEnabledAgents = async (
  params: StartEnabledAgentsParams,
): Promise<ReadonlyArray<StartEnabledAgentResult>> => {
  const enabledIds = params.agentSettingsRepository
    .list()
    .filter((agent) => agent.enabled)
    .map((agent) => agent.id)

  if (enabledIds.length === 0) {
    return []
  }

  params.log.info({ agentIds: enabledIds }, "starting enabled ACP agents")

  const results = await Promise.all(
    enabledIds.map(async (agentId): Promise<StartEnabledAgentResult> => {
      try {
        await params.acpSupervisor.start(agentId)
        return { agentId, ok: true }
      } catch (error: unknown) {
        return { agentId, ok: false, error }
      }
    }),
  )

  results.forEach((result) => {
    if (result.ok) {
      params.log.info({ agentId: result.agentId }, "enabled ACP agent ready")
      return
    }

    params.log.warn(
      { agentId: result.agentId, err: result.error },
      "failed to start enabled ACP agent",
    )
  })

  return results
}
