import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test"
import { render, waitFor } from "@testing-library/react"
import { MemoryRouter } from "react-router"
import { ConnectionProvider } from "../connection/ConnectionProvider"
import { SettingsPage } from "../shell/pages/SettingsPage"

const validStatus = {
  version: "0.1.0",
  state: "online",
  bindAddress: "127.0.0.1",
  port: 3847,
  startedAt: "2026-01-01T00:00:00.000Z",
  uptimeSeconds: 42,
  acp: {
    state: "ready",
    activeSessions: 0,
  },
} as const

const originalFetch = globalThis.fetch

const renderSettingsPage = () =>
  render(
    <MemoryRouter initialEntries={["/settings"]}>
      <ConnectionProvider>
        <SettingsPage />
      </ConnectionProvider>
    </MemoryRouter>,
  )

describe("SettingsPage", () => {
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

  test("renders page intro description", () => {
    const { getByText } = renderSettingsPage()

    expect(getByText("Configure runtime behavior and diagnostics.")).toBeInTheDocument()
  })

  test("filesystem provider is read-only with zero configured roots", () => {
    const { getByText, getByRole } = renderSettingsPage()

    expect(getByText("0 configured")).toBeInTheDocument()
    expect(getByText("Local filesystem")).toBeInTheDocument()
    expect(getByRole("button", { name: "+ Allow another folder" })).toBeDisabled()
  })

  test("github and gitlab providers are greyed with coming soon", () => {
    const { getAllByText, getByRole } = renderSettingsPage()

    expect(getAllByText("Coming soon")).toHaveLength(2)
    expect(getByRole("button", { name: "Connect GitHub" })).toBeDisabled()
    expect(getByRole("button", { name: "Connect GitLab" })).toBeDisabled()
  })

  test("runtime toggles are disabled and unchecked", () => {
    const { getByRole } = renderSettingsPage()

    const allowLocalNetwork = getByRole("checkbox", { name: /allow local network/i })
    const detailedLogs = getByRole("checkbox", { name: /detailed request logs/i })

    expect(allowLocalNetwork).toBeDisabled()
    expect(allowLocalNetwork).not.toBeChecked()
    expect(detailedLogs).toBeDisabled()
    expect(detailedLogs).not.toBeChecked()
    expect(() => getByRole("checkbox", { name: /start with system/i })).toThrow()
  })

  test("download diagnostics button is disabled", () => {
    const { getByRole } = renderSettingsPage()

    expect(getByRole("button", { name: "Download diagnostics" })).toBeDisabled()
  })

  test("shows live endpoint and version when server is online", async () => {
    const { getByRole } = renderSettingsPage()

    await waitFor(() => {
      expect(getByRole("region", { name: "Server details" })).toHaveTextContent(
        "http://127.0.0.1:3847",
      )
    })

    const details = getByRole("region", { name: "Server details" })

    expect(details).toHaveTextContent("0.1.0")
    expect(details).toHaveTextContent("—")
  })

  test("shows em dashes when server is unreachable", async () => {
    globalThis.fetch = mock(() => Promise.reject(new Error("network error"))) as typeof fetch

    const { getByRole } = renderSettingsPage()

    await waitFor(() => {
      const details = getByRole("region", { name: "Server details" })
      const emDashes = details.textContent?.match(/—/g) ?? []
      expect(emDashes.length).toBeGreaterThanOrEqual(3)
    })
  })
})
