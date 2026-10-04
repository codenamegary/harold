import { FetchStatusEndpoint } from "./reachability.ports"

const statusFetchTimeoutMs = 10_000

/**
 * Transport-generic adapter over the platform `fetch` (Bun and Node 18+).
 * Failures of any kind surface as the port's `unreachable` result.
 */
export const makeNodeFetchStatusEndpoint = (): FetchStatusEndpoint => async (statusUrl) => {
  try {
    const response = await fetch(statusUrl, {
      headers: { accept: "application/json" },
      signal: AbortSignal.timeout(statusFetchTimeoutMs),
    })
    const body = await response.text()
    return { ok: true, response: { status: response.status, body } }
  } catch (cause: unknown) {
    return {
      ok: false,
      detail: cause instanceof Error ? cause.message : String(cause),
    }
  }
}
