import { AgentId } from "contracts/http/agent-settings"
import {
  ANY_AGENT,
  AgentFilter,
  AgentMethodHandler,
  AgentMethodName,
  AgentMethodRegistration,
} from "./method"

type HandlersByMethod = {
  [M in AgentMethodName]: Map<AgentFilter, AgentMethodHandler<M>>
}

export type AgentMethodTable = {
  register: <M extends AgentMethodName>(registration: AgentMethodRegistration<M>) => void
  resolve: <M extends AgentMethodName>(params: {
    agentId: AgentId
    method: M
  }) => AgentMethodHandler<M> | undefined
}

export const createAgentMethodTable = (): AgentMethodTable => {
  const handlersByMethod: HandlersByMethod = {
    "session/new": new Map(),
    "session/prompt": new Map(),
    "session/cancel": new Map(),
    "session/load": new Map(),
    "session/list": new Map(),
    "session/close": new Map(),
    "session/set_config_option": new Map(),
  }

  return {
    register: ({ agentId, method, handler }) => {
      handlersByMethod[method].set(agentId, handler)
    },
    resolve: ({ agentId, method }) => {
      const byAgent = handlersByMethod[method]
      return byAgent.get(agentId) ?? byAgent.get(ANY_AGENT)
    },
  }
}
