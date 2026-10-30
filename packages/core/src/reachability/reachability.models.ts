/**
 * Reachability failures carry one kind per verification stage (#320):
 * scheme validation, network reachability, HTTP status.
 */
export type ReachabilityFailure =
  | { readonly kind: "invalid_scheme"; readonly detail: string }
  | { readonly kind: "unreachable"; readonly detail: string }
  | { readonly kind: "non_2xx"; readonly status: number }

export type VerifiedAdvertisedEndpoint = Readonly<{
  advertisedUrl: string
  statusUrl: string
  httpStatus: number
}>

export type VerifyAdvertisedEndpointResult =
  | { readonly ok: true; readonly value: VerifiedAdvertisedEndpoint }
  | { readonly ok: false; readonly error: ReachabilityFailure }

/**
 * Android verifies reachability against `GET /v1/status`, so the
 * advertised endpoint is verified through the same path. A path prefix on the
 * advertised URL is kept and the trailing slash collapsed. Query and fragment
 * suffixes are not part of the endpoint base, so they are dropped before the
 * status path is appended.
 */
export const statusUrlFor = (advertisedUrl: string): string => {
  const queryOrFragment = advertisedUrl.search(/[?#]/)
  const base = queryOrFragment === -1 ? advertisedUrl : advertisedUrl.slice(0, queryOrFragment)
  return `${base.replace(/\/+$/, "")}/v1/status`
}
