export type ChatSelection = {
  workspaceId: string
  agentId: string
  sessionId: string
}

export const CHAT_SELECTION_STORAGE_KEY = "harold.chat.selection"

export const readChatSelection = (): ChatSelection | null => {
  const raw = window.localStorage.getItem(CHAT_SELECTION_STORAGE_KEY)
  if (raw === null) {
    return null
  }

  try {
    const parsed: unknown = JSON.parse(raw)
    if (
      typeof parsed !== "object" ||
      parsed === null ||
      !("workspaceId" in parsed) ||
      !("agentId" in parsed) ||
      !("sessionId" in parsed) ||
      typeof parsed.workspaceId !== "string" ||
      typeof parsed.sessionId !== "string" ||
      typeof parsed.agentId !== "string"
    ) {
      return null
    }

    return {
      workspaceId: parsed.workspaceId,
      agentId: parsed.agentId,
      sessionId: parsed.sessionId,
    }
  } catch {
    return null
  }
}

export const writeChatSelection = (selection: ChatSelection): void => {
  window.localStorage.setItem(CHAT_SELECTION_STORAGE_KEY, JSON.stringify(selection))
}

export const clearChatSelection = (): void => {
  window.localStorage.removeItem(CHAT_SELECTION_STORAGE_KEY)
}
