import { AgentId } from "contracts/http/agent-settings"
import { RequestExtensionRpcFn } from "../../supervisor/models"
import { createAcpJsonRpcError } from "../../transport/json.rpc.error"
import { readAcpSessionId } from "../session.id.reader"
import { ExtensionHandlers } from "./types"

export const createCursorExtensionHandlers = (
  agentId: AgentId,
  requestExtensionRpc: RequestExtensionRpcFn,
): ExtensionHandlers => ({
  "cursor/ask_question": async (params) => {
    const sessionId = readAcpSessionId(params)
    if (sessionId === undefined) {
      throw createAcpJsonRpcError("cursor request missing sessionId", -32000)
    }

    return requestExtensionRpc({
      agentId,
      sessionId,
      method: "cursor/ask_question",
      params,
    })
  },
  "cursor/create_plan": async (params) => {
    const sessionId = readAcpSessionId(params)
    if (sessionId === undefined) {
      throw createAcpJsonRpcError("cursor request missing sessionId", -32000)
    }

    return requestExtensionRpc({
      agentId,
      sessionId,
      method: "cursor/create_plan",
      params,
    })
  },
})
