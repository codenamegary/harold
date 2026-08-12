import { AgentId } from "contracts/http/agent-settings"
import { createAcpJsonRpcError } from "../../transport/json-rpc-error"
import { readAcpSessionId } from "../read.acp.session.id"
import { ExtensionHandlers } from "./types"

export type CreateCursorExtensionHandlersParams = {
  agentId: AgentId
  requestCursor: (input: {
    agentId: AgentId
    sessionId: string
    method: string
    params: unknown
  }) => Promise<unknown>
}

export const createCursorExtensionHandlers = ({
  agentId,
  requestCursor,
}: CreateCursorExtensionHandlersParams): ExtensionHandlers => ({
  "cursor/ask_question": async (params) => {
    const sessionId = readAcpSessionId(params)
    if (sessionId === undefined) {
      throw createAcpJsonRpcError("cursor request missing sessionId", -32000)
    }

    return requestCursor({
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

    return requestCursor({
      agentId,
      sessionId,
      method: "cursor/create_plan",
      params,
    })
  },
})
