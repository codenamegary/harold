import { SessionPhase } from "./session.phase"

export type SessionBinding = {
  acpSessionId: string
  sessionId: string
  workspaceId: string
  workspaceRoot: string
  phase: SessionPhase
  activeTurnId?: string
}

export type SessionBindingRegistry = {
  bind: (params: SessionBinding) => void
  unbind: (params: { acpSessionId: string }) => void
  getBinding: (acpSessionId: string) => SessionBinding | undefined
  getWorkspaceRoot: (acpSessionId: string) => string | undefined
  listByWorkspaceRoot: (workspaceRoot: string) => ReadonlyArray<SessionBinding>
  setPhase: (params: { acpSessionId: string; phase: SessionPhase }) => void
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
    listByWorkspaceRoot: (workspaceRoot) =>
      [...bindings.values()].filter((binding) => binding.workspaceRoot === workspaceRoot),
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
