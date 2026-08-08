import { afterEach, beforeEach, describe, expect, mock, setSystemTime, test } from "bun:test"
import { fireEvent, waitFor } from "@testing-library/react"
import { Device, DeviceCollectionSchema } from "contracts/http/device"
import React from "react"
import { useLocation } from "react-router"
import { renderWithProviders } from "../query/render.with.providers"
import { requestUrl } from "../test/request.url"
import { DevicesView } from "./DevicesView"

const originalFetch = globalThis.fetch

const desktop = {
  id: "dev_desktop",
  name: "Studio Desktop",
  platform: "macOS",
  state: "online",
  pairedAt: "2026-08-02T18:00:00.000Z",
  lastSeenAt: "2026-08-02T20:55:00.000Z",
} satisfies Device

const tablet = {
  id: "dev_tablet",
  name: "Kitchen tablet",
  platform: null,
  state: "offline",
  pairedAt: "2026-08-01T18:00:00.000Z",
  lastSeenAt: null,
} satisfies Device

const collection = (items: ReadonlyArray<Device>) =>
  DeviceCollectionSchema.parse({
    items,
    page: { limit: 100, count: items.length },
  })

const LocationProbe: React.FC = () => {
  const location = useLocation()
  return <output aria-label="Current route">{`${location.pathname}${location.search}`}</output>
}

describe("DevicesView", () => {
  beforeEach(() => {
    setSystemTime(new Date("2026-08-02T21:00:00.000Z"))
  })

  afterEach(() => {
    setSystemTime()
    globalThis.fetch = originalFetch
  })

  test("loads paired devices with summary counts and platform column", async () => {
    globalThis.fetch = mock((input: RequestInfo | URL) => {
      const url = requestUrl(input)

      if (url.startsWith("/v1/devices")) {
        return Promise.resolve(
          new Response(JSON.stringify(collection([desktop, tablet])), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          }),
        )
      }

      return Promise.resolve(new Response("not found", { status: 404 }))
    }) as typeof fetch

    const { getByRole, getByText } = renderWithProviders(<DevicesView />, {
      initialEntries: ["/devices"],
    })

    await waitFor(() => {
      expect(getByText("1 device online")).toBeInTheDocument()
    })

    expect(getByText("of 2 paired")).toBeInTheDocument()
    expect(getByText("Last new pairing")).toBeInTheDocument()
    expect(getByText("3h ago")).toBeInTheDocument()
    expect(getByText("Authentication")).toBeInTheDocument()
    expect(getByText("Device credentials")).toBeInTheDocument()
    expect(getByText("Bearer tokens")).toBeInTheDocument()
    expect(getByText("PLATFORM")).toBeInTheDocument()
    expect(getByText("Studio Desktop")).toBeInTheDocument()
    expect(getByText("macOS")).toBeInTheDocument()
    expect(getByText("5m ago")).toBeInTheDocument()
    expect(getByText("Kitchen tablet")).toBeInTheDocument()
    expect(getByText("—")).toBeInTheDocument()
    expect(getByRole("button", { name: "Revoke Studio Desktop" })).toBeEnabled()
    expect(getByRole("button", { name: "Delete Studio Desktop" })).toBeEnabled()
  })

  test("navigates pair action to connect flow", async () => {
    globalThis.fetch = mock(() =>
      Promise.resolve(
        new Response(JSON.stringify(collection([])), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      ),
    ) as typeof fetch

    const { getByLabelText, getByRole } = renderWithProviders(
      <>
        <DevicesView />
        <LocationProbe />
      </>,
      { initialEntries: ["/devices"] },
    )

    await waitFor(() => {
      expect(getByRole("button", { name: "+ Pair new device" })).toBeEnabled()
    })
    fireEvent.click(getByRole("button", { name: "+ Pair new device" }))
    expect(getByLabelText("Current route")).toHaveTextContent("/connect?step=pair")
  })

  test("revokes a device and refreshes the list", async () => {
    const state = { revoked: false }
    globalThis.fetch = mock((input: RequestInfo | URL, init?: RequestInit) => {
      const url = requestUrl(input)
      const method = init?.method ?? "GET"

      if (url === "/v1/devices/dev_desktop" && method === "DELETE") {
        state.revoked = true
        return Promise.resolve(new Response(null, { status: 204 }))
      }

      if (url.startsWith("/v1/devices")) {
        return Promise.resolve(
          new Response(
            JSON.stringify(collection(state.revoked ? [tablet] : [desktop, tablet])),
            {
              status: 200,
              headers: { "Content-Type": "application/json" },
            },
          ),
        )
      }

      return Promise.resolve(new Response("not found", { status: 404 }))
    }) as typeof fetch

    const { getByRole, queryByText } = renderWithProviders(<DevicesView />, {
      initialEntries: ["/devices"],
    })

    await waitFor(() => {
      expect(getByRole("button", { name: "Revoke Studio Desktop" })).toBeEnabled()
    })

    fireEvent.click(getByRole("button", { name: "Revoke Studio Desktop" }))

    await waitFor(() => {
      expect(queryByText("Studio Desktop")).not.toBeInTheDocument()
    })
    expect(queryByText("Kitchen tablet")).toBeInTheDocument()
  })

  test("hard-deletes a device and refreshes the list", async () => {
    const state = { deleted: false }
    globalThis.fetch = mock((input: RequestInfo | URL, init?: RequestInit) => {
      const url = requestUrl(input)
      const method = init?.method ?? "GET"

      if (
        url === "/v1/devices/dev_desktop?hardDelete=true" &&
        method === "DELETE"
      ) {
        state.deleted = true
        return Promise.resolve(new Response(null, { status: 204 }))
      }

      if (url.startsWith("/v1/devices")) {
        return Promise.resolve(
          new Response(
            JSON.stringify(collection(state.deleted ? [tablet] : [desktop, tablet])),
            {
              status: 200,
              headers: { "Content-Type": "application/json" },
            },
          ),
        )
      }

      return Promise.resolve(new Response("not found", { status: 404 }))
    }) as typeof fetch

    const { getByRole, queryByText } = renderWithProviders(<DevicesView />, {
      initialEntries: ["/devices"],
    })

    await waitFor(() => {
      expect(getByRole("button", { name: "Delete Studio Desktop" })).toBeEnabled()
    })

    fireEvent.click(getByRole("button", { name: "Delete Studio Desktop" }))

    await waitFor(() => {
      expect(queryByText("Studio Desktop")).not.toBeInTheDocument()
    })
    expect(queryByText("Kitchen tablet")).toBeInTheDocument()
  })

  test("shows static danger note help text", () => {
    globalThis.fetch = mock(() =>
      Promise.resolve(
        new Response(JSON.stringify(collection([])), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      ),
    ) as typeof fetch

    const { getByText } = renderWithProviders(<DevicesView />, {
      initialEntries: ["/devices"],
    })

    expect(getByText("Lost a device?")).toBeInTheDocument()
    expect(
      getByText(
        "Revoking access immediately invalidates its credentials. The device can be paired again later.",
      ),
    ).toBeInTheDocument()
  })
})
