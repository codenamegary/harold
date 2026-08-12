import { JsonRpcId } from "./protocol"

type InFlightPrompt = {
  readonly requestId: JsonRpcId
}

export type FakeAcpListedSession = {
  readonly sessionId: string
  readonly cwd: string
  readonly title: string
  readonly updatedAt: string
}

export type FakeAcpPromptState = {
  allocateSessionId: () => string
  recordSession: (params: { sessionId: string; cwd: string }) => void
  listSessions: () => readonly FakeAcpListedSession[]
  start: (params: { sessionId: string; requestId: JsonRpcId }) => void
  cancel: (sessionId: string) => JsonRpcId | undefined
  completeNatural: (sessionId: string) => JsonRpcId | undefined
  shouldEmit: (sessionId: string) => boolean
  pendingRequestId: (sessionId: string) => JsonRpcId | undefined
}

export const createFakeAcpPromptState = (): FakeAcpPromptState => {
  const prompts = new Map<string, InFlightPrompt>()
  const sessions = new Map<string, FakeAcpListedSession>()
  const sessionCounter = { next: 0 }

  return {
    allocateSessionId: () => {
      sessionCounter.next += 1
      return `fake-session-${sessionCounter.next}`
    },
    recordSession: ({ sessionId, cwd }) => {
      sessions.set(sessionId, {
        sessionId,
        cwd,
        title: sessionId,
        updatedAt: new Date().toISOString(),
      })
    },
    listSessions: () => [...sessions.values()],
    start: ({ sessionId, requestId }) => {
      prompts.set(sessionId, { requestId })
    },
    cancel: (sessionId) => {
      const prompt = prompts.get(sessionId)
      if (prompt === undefined) {
        return undefined
      }

      prompts.delete(sessionId)
      return prompt.requestId
    },
    completeNatural: (sessionId) => {
      const prompt = prompts.get(sessionId)
      if (prompt === undefined) {
        return undefined
      }

      prompts.delete(sessionId)
      return prompt.requestId
    },
    shouldEmit: (sessionId) => prompts.has(sessionId),
    pendingRequestId: (sessionId) => prompts.get(sessionId)?.requestId,
  }
}
