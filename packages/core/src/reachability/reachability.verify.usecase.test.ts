import { describe, expect, test } from "bun:test"
import { FetchStatusEndpoint } from "./reachability.ports"
import {
  makeVerifyAdvertisedEndpoint,
  VerifyAdvertisedEndpointDeps,
} from "./reachability.verify.usecase"

type FetchOverride =
  | { ok: true; response: { status: number; body: string } }
  | { ok: false; detail: string }

const makeDeps = (
  override: FetchOverride = { ok: true, response: { status: 200, body: "{}" } },
): VerifyAdvertisedEndpointDeps & { requestedUrls: string[] } => {
  const requestedUrls: string[] = []
  const fetchStatus: FetchStatusEndpoint = async (statusUrl) => {
    requestedUrls.push(statusUrl)
    return override
  }
  return { fetchStatus, requestedUrls }
}

describe("makeVerifyAdvertisedEndpoint", () => {
  test("verifies an https advertised endpoint with a 2xx status probe", async () => {
    const deps = makeDeps()
    const verifyAdvertisedEndpoint = makeVerifyAdvertisedEndpoint(deps)

    const result = await verifyAdvertisedEndpoint("https://agents.example.com")

    expect(result).toEqual({
      ok: true,
      value: {
        advertisedUrl: "https://agents.example.com",
        statusUrl: "https://agents.example.com/v1/status",
        httpStatus: 200,
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

  test("accepts an http advertised endpoint on a private network host", async () => {
    const deps = makeDeps()
    const verifyAdvertisedEndpoint = makeVerifyAdvertisedEndpoint(deps)

    const result = await verifyAdvertisedEndpoint("http://192.168.1.10:3847")

    expect(result.ok).toBe(true)
    expect(deps.requestedUrls).toEqual(["http://192.168.1.10:3847/v1/status"])
  })

  test("rejects an http advertised endpoint on a public host before fetching", async () => {
    const deps = makeDeps()
    const verifyAdvertisedEndpoint = makeVerifyAdvertisedEndpoint(deps)

    const result = await verifyAdvertisedEndpoint("http://agents.example.com")

    expect(result).toEqual({
      ok: false,
      error: {
        kind: "invalid_scheme",
        detail:
          '"http://agents.example.com" must be an absolute https URL, or an http URL on a loopback or private-network host',
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

  test("accepts any 2xx body: the probe checks reachability, not the document", async () => {
    const deps = makeDeps({ ok: true, response: { status: 200, body: "<html>" } })
    const verifyAdvertisedEndpoint = makeVerifyAdvertisedEndpoint(deps)

    const result = await verifyAdvertisedEndpoint("https://agents.example.com")

    expect(result.ok).toBe(true)
  })
})
