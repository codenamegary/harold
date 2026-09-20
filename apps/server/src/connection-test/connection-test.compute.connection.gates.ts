import { ConnectionCheckResult } from "contracts/http/connection-test"

export const computeConnectionGates = (
  checks: ReadonlyArray<ConnectionCheckResult>,
): { canContinue: boolean; canContinueAnyway: boolean } => {
  const byId = new Map(checks.map((check) => [check.id, check]))
  const dns = byId.get("dns")
  const tls = byId.get("tls")
  const deviceAuth = byId.get("device-auth")

  const dnsPass = dns?.status === "pass"
  const deviceAuthPass = deviceAuth?.status === "pass"
  const tlsPass = tls?.status === "pass"
  const tlsWarn = tls?.status === "warn"

  return {
    canContinue: dnsPass && deviceAuthPass && tlsPass,
    canContinueAnyway: dnsPass && deviceAuthPass && tlsWarn && !tlsPass,
  }
}
