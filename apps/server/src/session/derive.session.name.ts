const SESSION_NAME_MAX_LENGTH = 120

export const deriveSessionNameFromPrompt = (text: string): string => {
  const trimmed = text.trim()
  if (trimmed.length <= SESSION_NAME_MAX_LENGTH) {
    return trimmed
  }

  return trimmed.slice(0, SESSION_NAME_MAX_LENGTH)
}
