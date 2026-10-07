import { WhichFn } from "../agent-settings/resolve-agent-path"

/**
 * Atomic presence port: a catalog override may probe whether its agent binary
 * is present on the host. The input and result shapes live here so the port
 * only depends on itself; `agent.profile.override.ts` imports them.
 */
export type PresenceProbeContext = {
  readonly which: WhichFn
  readonly env: Readonly<Record<string, string | undefined>>
}

export type PresenceProbeResult = {
  readonly present: boolean
  readonly path: string | null
}

export type PresenceProbe = (ctx: PresenceProbeContext) => PresenceProbeResult
