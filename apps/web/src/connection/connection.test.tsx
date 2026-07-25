import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test"
import { fireEvent, render, waitFor, within } from "@testing-library/react"
import { MemoryRouter } from "react-router"
import { AppRoutes } from "../shell/AppRouter"
import { fetchStatus } from "./fetchStatus"

const validStatus = {
  version: "0.1.0",
  state: "online",
  bindAddress: "127.0.0.1",
  port: 3847,
  startedAt: "2026-01-01T00:00:00.000Z",
  acp: {
    state: "ready",
    activeSessions: 0,
  },
} as const

const originalFetch = globalThis.fetch

describe("fetchStatus", () => {
  afterEach(() => {
    globalThis.fetch = originalFetch
  })

  test("fetches /v1/status and parses with StatusSchema", async () => {
    const fetchMock = mock(() =>
      Promise.resolve(
        new Response(JSON.stringify(validStatus), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      ),
    )
    globalThis.fetch = fetchMock as typeof fetch

    const status = await fetchStatus()

    expect(fetchMock).toHaveBeenCalledWith("/v1/status")
    expect(status).toEqual(validStatus)
  })

  test("rejects when the status endpoint is unreachable", async () => {
    globalThis.fetch = mock(() => Promise.reject(new Error("network error"))) as typeof fetch

    await expect(fetchStatus()).rejects.toThrow("network error")
  })
})

describe("connection shell wiring", () => {
  beforeEach(() => {
    globalThis.fetch = mock(() =>
      Promise.resolve(
        new Response(JSON.stringify(validStatus), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      ),
    ) as typeof fetch
  })

  afterEach(() => {
    globalThis.fetch = originalFetch
  })

  test("sidebar and topbar show live status when API is online", async () => {
    const { getByRole, getByText } = render(
      <MemoryRouter initialEntries={["/"]}>
        <AppRoutes />
      </MemoryRouter>,
    )

    const sidebar = getByRole("complementary", { name: "Sidebar" })

    await waitFor(() => {
      expect(within(sidebar).getByText("127.0.0.1:3847")).toBeInTheDocument()
    })

    expect(within(sidebar).getByLabelText("online status")).toBeInTheDocument()
    expect(within(sidebar).getByText("LIVE")).toBeInTheDocument()
    expect(within(sidebar).getByText("0.1.0")).toBeInTheDocument()
    expect(within(sidebar).queryByText("v0.8.4")).not.toBeInTheDocument()
    expect(getByText("API connected")).toBeInTheDocument()

    const connectLink = within(sidebar).getByRole("link", { name: /connect/i })
    expect(within(connectLink).queryByText("2")).not.toBeInTheDocument()
  })

  test("sidebar and topbar show unreachable state when API is down", async () => {
    globalThis.fetch = mock(() => Promise.reject(new Error("network error"))) as typeof fetch

    const { getByRole, getByText, queryByText } = render(
      <MemoryRouter initialEntries={["/"]}>
        <AppRoutes />
      </MemoryRouter>,
    )

    const sidebar = getByRole("complementary", { name: "Sidebar" })

    await waitFor(() => {
      expect(getByText("API unreachable")).toBeInTheDocument()
    })

    expect(within(sidebar).getByLabelText("offline status")).toBeInTheDocument()
    expect(queryByText("127.0.0.1:3847")).not.toBeInTheDocument()
    expect(queryByText("LIVE")).not.toBeInTheDocument()
    expect(queryByText("demo data")).not.toBeInTheDocument()
    expect(within(sidebar).getByText("—")).toBeInTheDocument()
    expect(within(sidebar).queryByText("v0.8.4")).not.toBeInTheDocument()
    expect(within(sidebar).queryByText("0.1.0")).not.toBeInTheDocument()

    const connectLink = within(sidebar).getByRole("link", { name: /connect/i })
    expect(within(connectLink).queryByText("2")).not.toBeInTheDocument()
  })

  test("refresh button refetches status", async () => {
    const fetchMock = mock(() =>
      Promise.resolve(
        new Response(JSON.stringify(validStatus), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      ),
    )
    globalThis.fetch = fetchMock as typeof fetch

    const { getByRole, getByText } = render(
      <MemoryRouter initialEntries={["/"]}>
        <AppRoutes />
      </MemoryRouter>,
    )

    await waitFor(() => {
      expect(getByText("API connected")).toBeInTheDocument()
    })

    fireEvent.click(getByRole("button", { name: "Refresh data" }))

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(2)
    })
  })
})
