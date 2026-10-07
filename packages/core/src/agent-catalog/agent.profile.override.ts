import { PresenceProbe, PresenceProbeContext, PresenceProbeResult } from "./catalog.ports"

export type AcpClientCapabilities = {
  readonly fs: {
    readonly readTextFile: true
    readonly writeTextFile: true
  }
  readonly terminal: true
  readonly _meta?: {
    readonly parameterizedModelPicker?: boolean
  }
}

export type AgentProfileOverride = {
  readonly command?: readonly string[]
  readonly authMethodId?: string
  readonly clientCapabilities?: AcpClientCapabilities
  readonly binaryName?: string
  readonly presenceProbe?: PresenceProbe
}

export const defaultClientCapabilities: AcpClientCapabilities = {
  fs: {
    readTextFile: true,
    writeTextFile: true,
  },
  terminal: true,
}

export const probeEnvOrWhich = (
  ctx: PresenceProbeContext,
  envKey: string,
  binaryName: string,
): PresenceProbeResult => {
  const fromEnv = ctx.env[envKey]
  if (typeof fromEnv === "string" && fromEnv.length > 0) {
    return { present: true, path: fromEnv }
  }

  const path = ctx.which(binaryName) ?? null
  return { present: path !== null, path }
}

export const probeWhich = (ctx: PresenceProbeContext, binaryName: string): PresenceProbeResult => {
  const path = ctx.which(binaryName) ?? null
  return { present: path !== null, path }
}
