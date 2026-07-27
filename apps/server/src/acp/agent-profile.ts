import { AgentId } from "contracts/http/agent-settings"

export type AcpClientCapabilities = {
  readonly fs: {
    readonly readTextFile: true
    readonly writeTextFile: true
  }
  readonly terminal: {
    readonly create: true
    readonly output: true
    readonly waitForExit: true
    readonly kill: true
    readonly release: true
  }
}

export type AgentProfile = {
  readonly id: AgentId
  readonly command: readonly string[]
  readonly authMethodId: string
  readonly clientCapabilities: AcpClientCapabilities
}

const cursorClientCapabilities: AcpClientCapabilities = {
  fs: {
    readTextFile: true,
    writeTextFile: true,
  },
  terminal: {
    create: true,
    output: true,
    waitForExit: true,
    kill: true,
    release: true,
  },
}

export const cursorAgentProfile: AgentProfile = {
  id: "cursor",
  command: ["agent", "acp"],
  authMethodId: "cursor_login",
  clientCapabilities: cursorClientCapabilities,
}

export const agentProfilesById: Record<AgentId, AgentProfile | undefined> = {
  cursor: cursorAgentProfile,
  claude: undefined,
}

export const resolveAgentProfile = (agentId: AgentId): AgentProfile | undefined =>
  agentProfilesById[agentId]
