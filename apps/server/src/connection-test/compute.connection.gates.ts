import { ConnectionCheckResult } from "contracts/http/connection-test"

const SELF_SIGNED_TLS_CODES = new Set([
  "DEPTH_ZERO_SELF_SIGNED_CERT",
  "SELF_SIGNED_CERT_IN_CHAIN",
  "UNABLE_TO_VERIFY_LEAF_SIGNATURE",
])

export const isSelfSignedTlsError = (error: unknown): boolean => {
  if (typeof error !== "object" || error === null || !("code" in error)) {
    return false
  }

  const code = error.code
  return typeof code === "string" && SELF_SIGNED_TLS_CODES.has(code)
}

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
