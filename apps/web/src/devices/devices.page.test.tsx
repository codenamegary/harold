import { afterEach, describe, expect, mock, test } from "bun:test"
import { waitFor } from "@testing-library/react"
import { DeviceCollectionSchema } from "contracts/http/device"
import { renderWithProviders } from "../query/render.with.providers"
import { DevicesPage } from "../shell/pages/DevicesPage"

const originalFetch = globalThis.fetch

const deviceCollection = DeviceCollectionSchema.parse({
  items: [
    {
      id: "dev_desktop",
      name: "Studio Desktop",
      platform: "macOS",
      state: "online",
      pairedAt: "2026-08-02T18:00:00.000Z",
      lastSeenAt: "2026-08-02T20:55:00.000Z",
    },
  ],
  page: { limit: 100, count: 1 },
})

describe("DevicesPage", () => {
  afterEach(() => {
    globalThis.fetch = originalFetch
  })

  test("renders live pair action and loaded devices", async () => {
    globalThis.fetch = mock(() =>
      Promise.resolve(
        new Response(JSON.stringify(deviceCollection), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      ),
    ) as typeof fetch

    const { getByRole, getByText } = renderWithProviders(<DevicesPage />, {
      initialEntries: ["/devices"],
    })

    await waitFor(() => {
      expect(getByText("Studio Desktop")).toBeInTheDocument()
    })
    expect(getByRole("button", { name: "+ Pair new device" })).toBeEnabled()
    expect(getByText("1 device online")).toBeInTheDocument()
    expect(getByText("of 1 paired")).toBeInTheDocument()
    expect(getByText("DEVICE")).toBeInTheDocument()
    expect(getByRole("button", { name: "Revoke Studio Desktop" })).toBeEnabled()
  })
})
