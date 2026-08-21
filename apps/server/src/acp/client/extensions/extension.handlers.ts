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
): ExtensionHandlers => {
  const factory = extensionHandlers[agentId]
  return factory === undefined ? {} : factory(agentId, requestExtensionRpc)
}
