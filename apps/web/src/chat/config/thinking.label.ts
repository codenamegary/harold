export const stripThinkingPrefix = (label: string): string =>
  label.replace(/^thinking\s*:\s*/i, "").replace(/^thinking\s+/i, "")
