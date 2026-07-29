import { useMutation } from "@tanstack/react-query"
import { AgentId } from "contracts/http/agent-settings"
import { detectAgentPath } from "./detect.agent.path"

export const useDetectAgentPathMutation = () =>
  useMutation({
    mutationFn: (agentId: AgentId) => detectAgentPath(agentId),
  })
