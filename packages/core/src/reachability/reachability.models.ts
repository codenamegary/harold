import { Status, StatusSchema } from "contracts/http/status"

/**
 * Reachability failures carry one kind per verification stage (#320):
 * scheme validation, network reachability, HTTP status, body contract.
 */
export type ReachabilityFailure =
  | { readonly kind: "invalid_scheme"; readonly detail: string }
  | { readonly kind: "unreachable"; readonly detail: string }
  | { readonly kind: "non_2xx"; readonly status: number }
  | { readonly kind: "invalid_body"; readonly detail: string }

export type VerifiedAdvertisedEndpoint = Readonly<{
  advertisedUrl: string
  statusUrl: string
  httpStatus: number
  status: Status
}>

export type VerifyAdvertisedEndpointResult =
  | { readonly ok: true; readonly value: VerifiedAdvertisedEndpoint }
  | { readonly ok: false; readonly error: ReachabilityFailure }

/**
 * Android verifies reachability against `GET /v1/status` (ADR-0006), so the
 * advertised endpoint is verified through the same path. A path prefix on the
 * advertised URL is kept and the trailing slash collapsed.
 */
export const statusUrlFor = (advertisedUrl: string): string =>
  `${advertisedUrl.replace(/\/+$/, "")}/v1/status`

export type ParsedStatusDocument =
  | { readonly ok: true; readonly status: Status }
  | { readonly ok: false; readonly detail: string }

export const parseStatusDocument = (body: string): ParsedStatusDocument => {
  let parsed: unknown
  try {
    parsed = JSON.parse(body)
  } catch {
    return { ok: false, detail: "body is not valid JSON" }
  }

  const result = StatusSchema.safeParse(parsed)
  if (!result.success) {
    return {
      ok: false,
      detail: result.error.issues.map((issue) => issue.message).join("; "),
    }
  }

  return { ok: true, status: result.data }
}
