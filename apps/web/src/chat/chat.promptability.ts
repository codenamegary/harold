import { SessionState } from "contracts/http/session"

type ComposerPromptabilityParams = {
  workspaceId: string
  agentId: string
  sessionId: string
  sessionState: SessionState | null
}

export const resolveEffectiveSessionState = (params: {
  sessionId: string
  transcriptSessionState: SessionState | null
  listSessionState: SessionState | undefined
}): SessionState | null => {
  const { sessionId, transcriptSessionState, listSessionState } = params

  if (sessionId === "") {
    return null
  }

  return transcriptSessionState ?? listSessionState ?? null
}

export const isComposerPromptable = (params: ComposerPromptabilityParams): boolean => {
  const { workspaceId, agentId, sessionId, sessionState } = params

  if (workspaceId === "" || agentId === "") {
    return false
  }

  if (sessionId === "") {
    return true
  }

  return sessionState === "idle"
}

export const composerBlockedMessage = (
  sessionState: SessionState | null,
): string | null => {
  if (sessionState === "offline") {
    return "Session reconnecting. Prompts unlock when it is idle again."
  }

  if (sessionState === "error") {
    return "Session ended with an error. Start a new session to continue."
  }

  return null
}
