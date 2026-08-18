import { afterEach, describe, expect, mock, test } from "bun:test"
import { fireEvent, waitFor } from "@testing-library/react"
import { LogCollectionSchema } from "contracts/http/logs"
import { renderWithProviders } from "../query/render.with.providers"
import { requestUrl } from "../test/request.url"
import { LogsPage } from "../shell/pages/LogsPage"

const originalFetch = globalThis.fetch

const logCollection = LogCollectionSchema.parse({
  items: [
    {
      id: "13",
      ts: "2026-08-17T20:04:06.000Z",
      level: "error",
      source: "server",
      message: "session ended",
    },
    {
      id: "12",
      ts: "2026-08-17T20:04:05.123Z",
      level: "warn",
      source: "agent",
      agentId: "cursor",
      message: "ACP agent start failed Agent executable path is not configured",
    },
  ],
  page: { limit: 200, count: 2 },
})

const emptyCollection = LogCollectionSchema.parse({
  items: [],
  page: { limit: 200, count: 0 },
})

describe("LogsPage", () => {
  afterEach(() => {
    globalThis.fetch = originalFetch
  })

  test("renders live log lines from the API", async () => {
    globalThis.fetch = mock(() =>
      Promise.resolve(
        new Response(JSON.stringify(logCollection), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      ),
    ) as typeof fetch

    const { getByRole, getByText } = renderWithProviders(<LogsPage />, {
      initialEntries: ["/logs"],
    })

    await waitFor(() => {
      expect(getByText("ACP agent start failed Agent executable path is not configured")).toBeInTheDocument()
    })
    const logRegion = getByRole("log", { name: "Process logs" })
    const logText = logRegion.textContent ?? ""
    expect(logText.indexOf("session ended")).toBeLessThan(
      logText.indexOf("ACP agent start failed"),
    )
    expect(logRegion).toHaveTextContent("WARN")
    expect(logRegion).toHaveTextContent("agent/cursor")
    expect(logRegion).toHaveTextContent("20:04:05.123")
    expect(getByRole("combobox", { name: "Minimum level" })).toBeEnabled()
    expect(getByRole("combobox", { name: "Source" })).toBeEnabled()
    expect(getByRole("button", { name: "Clear" })).toBeEnabled()
  })

  test("clear sends DELETE and shows the empty state", async () => {
    const logsState = { current: logCollection }

    globalThis.fetch = mock((input: RequestInfo | URL, init?: RequestInit) => {
      const url = requestUrl(input)
      const method = init?.method ?? "GET"

      if (url.startsWith("/v1/logs") && method === "DELETE") {
        logsState.current = emptyCollection
        return Promise.resolve(new Response(null, { status: 204 }))
      }

      return Promise.resolve(
        new Response(JSON.stringify(logsState.current), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      )
    }) as typeof fetch

    const { getByRole, getByText } = renderWithProviders(<LogsPage />, {
      initialEntries: ["/logs"],
    })

    await waitFor(() => {
      expect(getByText("agent/cursor")).toBeInTheDocument()
    })

    fireEvent.click(getByRole("button", { name: "Clear" }))

    await waitFor(() => {
      expect(getByText("No log lines in this process yet.")).toBeInTheDocument()
    })
  })
})
