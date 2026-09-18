import { AgentId, AgentSpawnSnapshot } from "contracts/http/agent-settings"

const unsetCustomBinaryName = "custom"

export const buildCustomSpawnSnapshot = (
  agentId: AgentId,
  displayName: string,
  path: string | null,
  args: readonly string[],
): AgentSpawnSnapshot => {
  if (path === null || path === "") {
    return {
      kind: "binary",
      binaryName: unsetCustomBinaryName,
      command: [unsetCustomBinaryName],
      displayName,
      authMethodId: agentId,
    }
  }

  return {
    kind: "binary",
    binaryName: path,
    command: [path, ...args],
    displayName,
    authMethodId: agentId,
  }
}
