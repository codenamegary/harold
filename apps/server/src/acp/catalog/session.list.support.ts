import { AgentId } from "contracts/http/agent-settings"

/**
 * Catalog agents known to omit `sessionCapabilities.list` (ACP registry matrix
 * 2026-08-11). They stay listed in settings but cannot be enabled for the
 * session gateway.
 */
export const AGENTS_WITHOUT_SESSION_LIST = new Set<AgentId>([
  "amp-acp",
  "cline",
  "corust-agent",
  "dirac",
  "gemini",
  "sigit",
  "stakpak",
])

export const agentSupportsSessionList = (agentId: AgentId): boolean =>
  !AGENTS_WITHOUT_SESSION_LIST.has(agentId)
