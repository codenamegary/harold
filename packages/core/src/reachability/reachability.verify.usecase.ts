import { AdvertisedUrlSchema } from "contracts/http/runtime-settings"
import {
  parseStatusDocument,
  ReachabilityFailure,
  statusUrlFor,
  VerifiedAdvertisedEndpoint,
  VerifyAdvertisedEndpointResult,
} from "./reachability.models"
import { FetchStatusEndpoint } from "./reachability.ports"

export type VerifyAdvertisedEndpointDeps = Readonly<{
  fetchStatus: FetchStatusEndpoint
}>

export type VerifyAdvertisedEndpoint = (
  advertisedUrl: string,
) => Promise<VerifyAdvertisedEndpointResult>

const invalidSchemeFailure = (advertisedUrl: string): ReachabilityFailure => ({
  kind: "invalid_scheme",
  detail: `"${advertisedUrl}" must be an absolute https URL, or an http URL on a loopback host`,
})

const is2xx = (status: number): boolean => status >= 200 && status <= 299

/**
 * Verifies an advertised endpoint the way a device would: resolve the
 * `GET /v1/status` URL, fetch it through the injected port, require 2xx, and
 * parse the body with the Status contract. Validation reuses the shared
 * reachability rule in `contracts/http/runtime-settings` (#313): https
 * everywhere, http only on loopback hosts.
 */
export const makeVerifyAdvertisedEndpoint =
  (deps: VerifyAdvertisedEndpointDeps): VerifyAdvertisedEndpoint =>
  async (advertisedUrl) => {
    const validated = AdvertisedUrlSchema.safeParse(advertisedUrl)
    if (!validated.success) {
      return { ok: false, error: invalidSchemeFailure(advertisedUrl) }
    }

    const statusUrl = statusUrlFor(advertisedUrl)
    const fetched = await deps.fetchStatus(statusUrl)
    if (!fetched.ok) {
      return { ok: false, error: { kind: "unreachable", detail: fetched.detail } }
    }

    if (!is2xx(fetched.response.status)) {
      return {
        ok: false,
        error: { kind: "non_2xx", status: fetched.response.status },
      }
    }

    const parsed = parseStatusDocument(fetched.response.body)
    if (!parsed.ok) {
      return { ok: false, error: { kind: "invalid_body", detail: parsed.detail } }
    }

    const value: VerifiedAdvertisedEndpoint = {
      advertisedUrl,
      statusUrl,
      httpStatus: fetched.response.status,
      status: parsed.status,
    }
    return { ok: true, value }
  }
