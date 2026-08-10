export const isCustomAgentId = (agentId: string): boolean =>
  agentId === "custom" || agentId.startsWith("custom-")
