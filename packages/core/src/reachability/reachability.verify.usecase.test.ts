import { describe, expect, test } from "bun:test"
import { Status } from "contracts/http/status"
import { FetchStatusEndpoint } from "./reachability.ports"
import {
  makeVerifyAdvertisedEndpoint,
  VerifyAdvertisedEndpointDeps,
} from "./reachability.verify.usecase"

const statusDocument: Status = {
  version: "0.2.1",
  state: "online",
  bindAddress: "127.0.0.1",
  port: 3847,
  startedAt: "2026-01-01T00:00:00.000Z",
  acp: { state: "ready", activeSessions: 2 },
}

const okBody = JSON.stringify(statusDocument)

type FetchOverride =
  | { ok: true; response: { status: number; body: string } }
  | { ok: false; detail: string }

const makeDeps = (
  override: FetchOverride = { ok: true, response: { status: 200, body: okBody } },
): VerifyAdvertisedEndpointDeps & { requestedUrls: string[] } => {
  const requestedUrls: string[] = []
  const fetchStatus: FetchStatusEndpoint = async (statusUrl) => {
    requestedUrls.push(statusUrl)
    return override
  }
  return { fetchStatus, requestedUrls }
}

describe("makeVerifyAdvertisedEndpoint", () => {
  test("verifies an https advertised endpoint against its status document", async () => {
    const deps = makeDeps()
    const verifyAdvertisedEndpoint = makeVerifyAdvertisedEndpoint(deps)

    const result = await verifyAdvertisedEndpoint("https://agents.example.com")

    expect(result).toEqual({
      ok: true,
      value: {
        advertisedUrl: "https://agents.example.com",
        statusUrl: "https://agents.example.com/v1/status",
        httpStatus: 200,
        status: statusDocument,
      },
    })
    expect(deps.requestedUrls).toEqual(["https://agents.example.com/v1/status"])
  })

  test("accepts an http advertised endpoint on a loopback host", async () => {
    const deps = makeDeps()
    const verifyAdvertisedEndpoint = makeVerifyAdvertisedEndpoint(deps)

    const result = await verifyAdvertisedEndpoint("http://127.0.0.1:3847")

    expect(result.ok).toBe(true)
    expect(deps.requestedUrls).toEqual(["http://127.0.0.1:3847/v1/status"])
  })

  test("rejects an http advertised endpoint on a non-loopback host before fetching", async () => {
    const deps = makeDeps()
    const verifyAdvertisedEndpoint = makeVerifyAdvertisedEndpoint(deps)

    const result = await verifyAdvertisedEndpoint("http://agents.example.com")

    expect(result).toEqual({
      ok: false,
      error: {
        kind: "invalid_scheme",
        detail:
          '"http://agents.example.com" must be an absolute https URL, or an http URL on a loopback host',
      },
    })
    expect(deps.requestedUrls).toEqual([])
  })

  test("rejects a malformed advertised URL before fetching", async () => {
    const deps = makeDeps()
    const verifyAdvertisedEndpoint = makeVerifyAdvertisedEndpoint(deps)

    const result = await verifyAdvertisedEndpoint("not a url")

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.kind).toBe("invalid_scheme")
    }
    expect(deps.requestedUrls).toEqual([])
  })

  test("reports unreachable when the fetch port fails", async () => {
    const deps = makeDeps({ ok: false, detail: "connect ECONNREFUSED" })
    const verifyAdvertisedEndpoint = makeVerifyAdvertisedEndpoint(deps)

    const result = await verifyAdvertisedEndpoint("https://agents.example.com")

    expect(result).toEqual({
      ok: false,
      error: { kind: "unreachable", detail: "connect ECONNREFUSED" },
    })
  })

  test("reports non_2xx when the status endpoint answers outside 2xx", async () => {
    const deps = makeDeps({
      ok: true,
      response: { status: 404, body: JSON.stringify({ error: "not_found" }) },
    })
    const verifyAdvertisedEndpoint = makeVerifyAdvertisedEndpoint(deps)

    const result = await verifyAdvertisedEndpoint("https://agents.example.com")

    expect(result).toEqual({ ok: false, error: { kind: "non_2xx", status: 404 } })
  })

  test("reports non_2xx for a 3xx redirect answer", async () => {
    const deps = makeDeps({ ok: true, response: { status: 301, body: "" } })
    const verifyAdvertisedEndpoint = makeVerifyAdvertisedEndpoint(deps)

    const result = await verifyAdvertisedEndpoint("https://agents.example.com")

    expect(result).toEqual({ ok: false, error: { kind: "non_2xx", status: 301 } })
  })

  test("reports invalid_body when the response is not JSON", async () => {
    const deps = makeDeps({ ok: true, response: { status: 200, body: "<html>" } })
    const verifyAdvertisedEndpoint = makeVerifyAdvertisedEndpoint(deps)

    const result = await verifyAdvertisedEndpoint("https://agents.example.com")

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.kind).toBe("invalid_body")
      expect(result.error.detail).toContain("JSON")
    }
  })

  test("reports invalid_body when the JSON violates the status contract", async () => {
    const deps = makeDeps({
      ok: true,
      response: {
        status: 200,
        body: JSON.stringify({ ...statusDocument, bindAddress: "0.0.0.0" }),
      },
    })
    const verifyAdvertisedEndpoint = makeVerifyAdvertisedEndpoint(deps)

    const result = await verifyAdvertisedEndpoint("https://agents.example.com")

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.kind).toBe("invalid_body")
    }
  })
})
