export type SessionBindingRegistry = {
  bind: (params: { acpSessionId: string; workspaceRoot: string }) => void
  unbind: (params: { acpSessionId: string }) => void
  getWorkspaceRoot: (acpSessionId: string) => string | undefined
}

export const createSessionBindingRegistry = (): SessionBindingRegistry => {
  const bindings = new Map<string, string>()

  return {
    bind: ({ acpSessionId, workspaceRoot }) => {
      bindings.set(acpSessionId, workspaceRoot)
    },
    unbind: ({ acpSessionId }) => {
      bindings.delete(acpSessionId)
    },
    getWorkspaceRoot: (acpSessionId) => bindings.get(acpSessionId),
  }
}
