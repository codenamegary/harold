import React from "react"
import { AgentAuthSummary } from "contracts/http/agent-auth"
import {
  agentAuthStatusLabels,
  agentAuthStatusTextClassName,
} from "./agent.auth.status"

type AgentAuthBadgeProps = {
  agentName: string
  summary: AgentAuthSummary
}

export const AgentAuthBadge: React.FC<AgentAuthBadgeProps> = ({
  agentName,
  summary,
}) => (
  <span
    aria-label={`${agentName} auth status`}
    className={`w-fit shrink-0 font-mono text-2xs ${agentAuthStatusTextClassName[summary.status]}`}
  >
    {agentAuthStatusLabels[summary.status]}
  </span>
)
