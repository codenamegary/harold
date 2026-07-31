import { JsonRpcId } from "./protocol"

type InFlightPrompt = {
  readonly requestId: JsonRpcId
}

export type FakeAcpPromptState = {
  allocateSessionId: () => string
  start: (params: { sessionId: string; requestId: JsonRpcId }) => void
  cancel: (sessionId: string) => JsonRpcId | undefined
  completeNatural: (sessionId: string) => JsonRpcId | undefined
  shouldEmit: (sessionId: string) => boolean
  pendingRequestId: (sessionId: string) => JsonRpcId | undefined
}

export const createFakeAcpPromptState = (): FakeAcpPromptState => {
  const prompts = new Map<string, InFlightPrompt>()
  const sessionCounter = { next: 0 }

  return {
    allocateSessionId: () => {
      sessionCounter.next += 1
      return `fake-session-${sessionCounter.next}`
    },
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
