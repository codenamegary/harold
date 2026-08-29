import { AcpSessionPromptStartResult } from "../../acp/supervisor/models"
import { SessionHubPromptSession } from "./hub"

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
      return {
        ok: false,
        reason: started.reason,
        ...(started.authRequired === true ? { authRequired: true } : {}),
      }
    }

    const completion = await started.completion
    if (!completion.ok) {
      return {
        ok: false,
        reason: completion.reason,
        ...(completion.authRequired === true ? { authRequired: true } : {}),
      }
    }

    return { ok: true }
  }
}
