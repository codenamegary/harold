export type ConfigSetParams = {
  sessionId: string
  configId: string
  value: string | boolean
}

export type ConfigSetController = {
  schedule: (params: ConfigSetParams) => void
  flush: (sessionId: string) => void
  cancel: (sessionId: string) => void
  dispose: () => void
}

/**
 * Trailing debounce of config sets, one pending value per session.
 * A new schedule for the same session replaces the pending one (latest wins).
 */
export const createConfigSetController = (params: {
  delayMs: number
  onFire: (params: ConfigSetParams) => void
}): ConfigSetController => {
  const pendingBySession = new Map<string, ConfigSetParams>()
  const timersBySession = new Map<string, ReturnType<typeof setTimeout>>()

  const clear = (sessionId: string) => {
    const timer = timersBySession.get(sessionId)
    if (timer !== undefined) {
      clearTimeout(timer)
      timersBySession.delete(sessionId)
    }
    pendingBySession.delete(sessionId)
  }

  return {
    schedule: (set) => {
      clear(set.sessionId)
      pendingBySession.set(set.sessionId, set)
      timersBySession.set(
        set.sessionId,
        setTimeout(() => {
          const pending = pendingBySession.get(set.sessionId)
          clear(set.sessionId)
          if (pending !== undefined) {
            params.onFire(pending)
          }
        }, params.delayMs),
      )
    },
    flush: (sessionId) => {
      const pending = pendingBySession.get(sessionId)
      clear(sessionId)
      if (pending !== undefined) {
        params.onFire(pending)
      }
    },
    cancel: (sessionId) => {
      clear(sessionId)
    },
    dispose: () => {
      for (const sessionId of timersBySession.keys()) {
        clear(sessionId)
      }
    },
  }
}
