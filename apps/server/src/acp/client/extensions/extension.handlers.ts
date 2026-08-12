import { AgentId } from "contracts/http/agent-settings"
import { RequestExtensionRpcFn } from "../../supervisor/acp-supervisor-types"
import { createCursorExtensionHandlers } from "./cursor"
import { ExtensionHandlers } from "./types"

export type ExtensionHandlersFactory = (
  agentId: AgentId,
  requestExtensionRpc: RequestExtensionRpcFn,
) => ExtensionHandlers

export const extensionHandlers: Partial<Record<AgentId, ExtensionHandlersFactory>> = {
  cursor: createCursorExtensionHandlers,
}

export const resolveExtensionHandlers = (
  agentId: AgentId,
  requestExtensionRpc: RequestExtensionRpcFn,
  profileHandlers: ExtensionHandlers,
): ExtensionHandlers => {
  const factory = extensionHandlers[agentId]
  const fromRegistry = factory === undefined ? {} : factory(agentId, requestExtensionRpc)
  return { ...fromRegistry, ...profileHandlers }
}
