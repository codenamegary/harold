import { AgentId } from "contracts/http/agent-settings"
import { readAcpSessionId } from "../session.id.reader"

export type CreateAcpPermissionHandlerParams = {
  agentId: AgentId
  requestPermission: (input: {
    agentId: AgentId
    sessionId: string
    params: unknown
  }) => Promise<unknown>
}

export const createAcpPermissionHandler = ({
  agentId,
  requestPermission,
}: CreateAcpPermissionHandlerParams) => ({
  handlePermissionRequest: async (input: {
    jsonRpcId: string | number
    params: unknown
    respond: (result: unknown) => void
    respondError: (code: number, message: string) => void
  }) => {
    const sessionId = readAcpSessionId(input.params)
    if (sessionId === undefined) {
      input.respondError(-32000, "permission request missing session id")
      return
    }

    try {
      const result = await requestPermission({
        agentId,
        sessionId,
        params: input.params,
      })
      input.respond(result)
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "permission request failed"
      input.respondError(-32000, message)
    }
  },
})
