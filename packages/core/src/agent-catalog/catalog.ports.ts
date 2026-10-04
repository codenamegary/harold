import { PresenceProbeContext, PresenceProbeResult } from "./agent.profile.override"

/**
 * Atomic presence port: a catalog override may probe whether its agent binary
 * is present on the host. Data shapes live in `agent.profile.override.ts`.
 */
export type PresenceProbe = (ctx: PresenceProbeContext) => PresenceProbeResult
