import { ExtensionHandlers } from "../client/extensions/types"

export type AcpClientCapabilities = {
  readonly fs: {
    readonly readTextFile: true
    readonly writeTextFile: true
  }
  readonly terminal: true
}

export type AgentProfileOverride = {
  readonly command?: readonly string[]
  readonly authMethodId?: string
  readonly clientCapabilities?: AcpClientCapabilities
  readonly extensionHandlers?: ExtensionHandlers
  readonly binaryName?: string
}

export const defaultClientCapabilities: AcpClientCapabilities = {
  fs: {
    readTextFile: true,
    writeTextFile: true,
  },
  terminal: true,
}
