/**
 * Curated popular ACP agent ids for later UI banding (AGE-39).
 * Ids must exist in the pinned registry snapshot.
 */
export const popularAgentAllowlist = [
  "cursor",
  "claude-acp",
  "codex-acp",
  "opencode",
  "gemini",
  "github-copilot-cli",
  "pi-acp",
  "goose",
  "auggie",
  "kilo",
] as const

export type PopularAgentId = (typeof popularAgentAllowlist)[number]
