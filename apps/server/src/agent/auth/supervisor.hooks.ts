import { AgentId } from "contracts/http/agent-settings"
import { AuthBroker } from "./broker"
import { resolveAuthAdapter } from "./registry"
import { AuthAdapter } from "./adapters/adapter"

export type SupervisorAuthHooks = {
  resolveAdapter: (agentId: AgentId) => AuthAdapter
  authBroker: AuthBroker
  requestRespawn: (agentId: AgentId) => Promise<void>
}

export const createSupervisorAuthHooks = (input: {
  authBroker: AuthBroker
  requestRespawn: (agentId: AgentId) => Promise<void>
  resolveAdapter?: (agentId: AgentId) => AuthAdapter
}): SupervisorAuthHooks => ({
  authBroker: input.authBroker,
  requestRespawn: input.requestRespawn,
  resolveAdapter: input.resolveAdapter ?? resolveAuthAdapter,
})
