import { AcpSessionPromptStartResult } from "../../acp/supervisor/acp-supervisor-types"
import { SessionHubPromptSession } from "./session.hub"

export type CreateAcpHubPromptSessionParams = {
  startPrompt: (params: {
    acpSessionId: string
    prompt: unknown
  }) => Promise<AcpSessionPromptStartResult>
}

export const createAcpHubPromptSession = (
  params: CreateAcpHubPromptSessionParams,
): SessionHubPromptSession => {
  return async ({ sessionId, text }) => {
    const started = await params.startPrompt({
      acpSessionId: sessionId,
      prompt: [{ type: "text", text }],
    })
    if (!started.ok) {
      return started
    }

    const completion = await started.completion
    if (!completion.ok) {
      return completion
    }

    return { ok: true }
  }
}
