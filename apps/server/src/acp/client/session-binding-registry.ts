import { JournalPhase } from "contracts/events/journal-record"

export type SessionBinding = {
  acpSessionId: string
  sessionId: string
  workspaceId: string
  workspaceRoot: string
  phase: JournalPhase
  activeTurnId?: string
}

export type SessionBindingRegistry = {
  bind: (params: SessionBinding) => void
  unbind: (params: { acpSessionId: string }) => void
  getBinding: (acpSessionId: string) => SessionBinding | undefined
  getWorkspaceRoot: (acpSessionId: string) => string | undefined
  setPhase: (params: { acpSessionId: string; phase: JournalPhase }) => void
  setActiveTurnId: (params: { acpSessionId: string; turnId: string | undefined }) => void
  count: () => number
  clear: () => void
}

export const createSessionBindingRegistry = (): SessionBindingRegistry => {
  const bindings = new Map<string, SessionBinding>()

  return {
    bind: (binding) => {
      bindings.set(binding.acpSessionId, binding)
    },
    unbind: ({ acpSessionId }) => {
      bindings.delete(acpSessionId)
    },
    getBinding: (acpSessionId) => bindings.get(acpSessionId),
    getWorkspaceRoot: (acpSessionId) => bindings.get(acpSessionId)?.workspaceRoot,
    setPhase: ({ acpSessionId, phase }) => {
      const existing = bindings.get(acpSessionId)
      if (existing === undefined) {
        return
      }

      bindings.set(acpSessionId, { ...existing, phase })
    },
    setActiveTurnId: ({ acpSessionId, turnId }) => {
      const existing = bindings.get(acpSessionId)
      if (existing === undefined) {
        return
      }

      bindings.set(acpSessionId, { ...existing, activeTurnId: turnId })
    },
    count: () => bindings.size,
    clear: () => {
      bindings.clear()
    },
  }
}
