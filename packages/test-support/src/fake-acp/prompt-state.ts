import { JsonRpcId } from "./protocol"

export type FakeAcpPromptState = {
  readonly cancelled: boolean
  readonly activeSessionId: string | null
  readonly pendingRequestId: JsonRpcId | null
  start: (params: { sessionId: string; requestId: JsonRpcId }) => void
  cancel: (sessionId: string) => JsonRpcId | undefined
  completeNatural: (sessionId: string) => JsonRpcId | undefined
  shouldEmit: (sessionId: string) => boolean
}

export const createFakeAcpPromptState = (): FakeAcpPromptState => {
  const state: {
    cancelled: boolean
    activeSessionId: string | null
    pendingRequestId: JsonRpcId | null
  } = {
    cancelled: false,
    activeSessionId: null,
    pendingRequestId: null,
  }

  return {
    get cancelled() {
      return state.cancelled
    },
    get activeSessionId() {
      return state.activeSessionId
    },
    get pendingRequestId() {
      return state.pendingRequestId
    },
    start: ({ sessionId, requestId }) => {
      state.cancelled = false
      state.activeSessionId = sessionId
      state.pendingRequestId = requestId
    },
    cancel: (sessionId) => {
      if (state.activeSessionId !== sessionId || state.pendingRequestId === null) {
        return undefined
      }

      const requestId = state.pendingRequestId
      state.cancelled = true
      state.activeSessionId = null
      state.pendingRequestId = null
      return requestId
    },
    completeNatural: (sessionId) => {
      if (
        state.cancelled
        || state.activeSessionId !== sessionId
        || state.pendingRequestId === null
      ) {
        return undefined
      }

      const requestId = state.pendingRequestId
      state.activeSessionId = null
      state.pendingRequestId = null
      return requestId
    },
    shouldEmit: (sessionId) => !state.cancelled && state.activeSessionId === sessionId,
  }
}
