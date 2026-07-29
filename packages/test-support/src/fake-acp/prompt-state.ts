export type FakeAcpPromptState = {
  readonly cancelled: boolean
  readonly activeSessionId: string | null
  start: (sessionId: string) => void
  cancel: (sessionId: string) => void
  shouldEmit: (sessionId: string) => boolean
}

export const createFakeAcpPromptState = (): FakeAcpPromptState => {
  const state: {
    cancelled: boolean
    activeSessionId: string | null
  } = {
    cancelled: false,
    activeSessionId: null,
  }

  return {
    get cancelled() {
      return state.cancelled
    },
    get activeSessionId() {
      return state.activeSessionId
    },
    start: (sessionId) => {
      state.cancelled = false
      state.activeSessionId = sessionId
    },
    cancel: (sessionId) => {
      if (state.activeSessionId === sessionId) {
        state.cancelled = true
        state.activeSessionId = null
      }
    },
    shouldEmit: (sessionId) => !state.cancelled && state.activeSessionId === sessionId,
  }
}
