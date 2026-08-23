import React from "react"
import { AgentAuthSummary } from "contracts/http/agent-auth"
import { AgentId } from "contracts/http/agent-settings"
import { AgentAuthPanel } from "./AgentAuthPanel"
import { useAgentAuthQuery } from "./use.agent.auth"

type AgentSettingsAuthSectionProps = {
  agentId: AgentId
  agentName: string
  summary: AgentAuthSummary
  enabled: boolean
}

export const AgentSettingsAuthSection: React.FC<AgentSettingsAuthSectionProps> = ({
  agentId,
  agentName,
  summary,
  enabled,
}) => {
  const needsAuthUi =
    summary.status !== "authenticated" || summary.activeSessionId !== null
  const authQuery = useAgentAuthQuery(enabled && needsAuthUi ? agentId : null, {
    pollWhileSessionActive: true,
  })

  const auth = authQuery.data ?? null
  const liveSummary: AgentAuthSummary =
    auth === null
      ? summary
      : {
          status: auth.status,
          error: auth.error,
          activeSessionId: auth.session?.status === "in_progress" ? auth.session.sessionId : null,
          canLogout: summary.canLogout,
        }

  if (!needsAuthUi && liveSummary.status === "authenticated") {
    return null
  }

  return (
    <div className="mb-4">
      <AgentAuthPanel
        agentId={agentId}
        agentName={agentName}
        summary={liveSummary}
        auth={auth}
      />
    </div>
  )
}
