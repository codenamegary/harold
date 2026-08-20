import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test"
import React from "react"
import { fireEvent, waitFor } from "@testing-library/react"
import { useLocation } from "react-router"
import { renderWithProviders } from "../query/render.with.providers"
import { requestBodyText, requestUrl } from "../test/request.url"
import { ConnectWizard } from "./ConnectWizard"

const originalFetch = globalThis.fetch

const defaultRuntimeSettings = {
  advertisedUrl: null,
  advertisedUrlEnabled: true,
  trustedProxies: [],
  bindHost: "127.0.0.1",
  bindPort: 3847,
  logLevel: "info",
  logPath: null,
  allowedRoots: [],
} as const

const wrapRuntimeSettingsView = (settings: typeof defaultRuntimeSettings) => ({
  settings,
  restartRequired: false,
  effective: {
    bindHost: settings.bindHost,
    bindPort: settings.bindPort,
    logPath: settings.logPath,
  },
  overrides: {},
})

const firstPairingCode = {
  id: "pair_01",
  code: "J7K-9P2",
  endpoint: "http://127.0.0.1:3847",
  state: "active",
  createdAt: "2026-08-02T21:00:00.000Z",
  expiresAt: "2026-08-02T21:10:00.000Z",
} as const

const advertisedPairingCode = {
  ...firstPairingCode,
  endpoint: "https://agents.example.com",
} as const

const secondPairingCode = {
  ...firstPairingCode,
  id: "pair_02",
  code: "Q3R-8T6",
  createdAt: "2026-08-02T21:01:00.000Z",
  expiresAt: "2026-08-02T21:11:00.000Z",
} as const

const emptyDeviceCollection = {
  items: [],
  page: { limit: 100, count: 0 },
}

const pairedDeviceCollection = {
  items: [
    {
      id: "dev_01",
      name: "Pixel 9",
      platform: "android",
      state: "online" as const,
      pairedAt: "2026-08-02T21:05:00.000Z",
      lastSeenAt: "2026-08-02T21:05:00.000Z",
    },
  ],
  page: { limit: 100, count: 1 },
}

const LocationProbe: React.FC = () => {
  const location = useLocation()
  return <output aria-label="Current route">{location.pathname}</output>
}

const renderConnectWizard = () =>
  renderWithProviders(
    <>
      <ConnectWizard />
      <LocationProbe />
    </>,
    {
      initialEntries: ["/connect"],
    },
  )

describe("ConnectWizard", () => {
  let runtimeSettings: {
    advertisedUrl: string | null
    advertisedUrlEnabled: boolean
    trustedProxies: readonly string[]
    bindHost: string
    bindPort: number
    logLevel: "debug" | "info" | "warn" | "error"
    logPath: string | null
    allowedRoots: readonly string[]
  }
  let pairingCodes: Array<typeof firstPairingCode | typeof secondPairingCode | typeof advertisedPairingCode>
  let hasPairedDevice: boolean
  let pairingBodies: Array<{ endpoint?: string }>

  beforeEach(() => {
    runtimeSettings = { ...defaultRuntimeSettings }
    pairingCodes = [firstPairingCode, secondPairingCode]
    hasPairedDevice = false
    pairingBodies = []

    globalThis.fetch = mock((input: RequestInfo | URL, init?: RequestInit) => {
      const url = requestUrl(input)
      const method = init?.method ?? "GET"

      if (url.startsWith("/v1/settings/runtime") && method === "GET") {
        return Promise.resolve(
          new Response(JSON.stringify(wrapRuntimeSettingsView(runtimeSettings)), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          }),
        )
      }

      if (url.startsWith("/v1/devices") && method === "GET") {
        return Promise.resolve(
          new Response(
            JSON.stringify(hasPairedDevice ? pairedDeviceCollection : emptyDeviceCollection),
            {
              status: 200,
              headers: { "Content-Type": "application/json" },
            },
          ),
        )
      }

      if (url === "/v1/pairing-codes" && method === "POST") {
        const bodyText = requestBodyText(init?.body)
        const body = bodyText.length > 0 ? (JSON.parse(bodyText) as { endpoint?: string }) : {}
        pairingBodies.push(body)
        const nextCode =
          body.endpoint === "advertised" && runtimeSettings.advertisedUrl !== null
            ? advertisedPairingCode
            : pairingCodes.shift() ?? secondPairingCode
        return Promise.resolve(
          new Response(JSON.stringify(nextCode), {
            status: 201,
            headers: { "Content-Type": "application/json" },
          }),
        )
      }

      return Promise.resolve(new Response("not found", { status: 404 }))
    }) as typeof fetch
  })

  afterEach(() => {
    globalThis.fetch = originalFetch
  })

  test("lands directly on pure pair view without wizard rails or badge clutter", async () => {
    const { getByRole, queryByRole, queryByText } = renderConnectWizard()

    await waitFor(() => {
      expect(getByRole("heading", { name: /pair a device/i })).toBeInTheDocument()
    })
    expect(queryByRole("button", { name: /set up cloud proxy/i })).toBeNull()
    expect(queryByRole("button", { name: /external url/i })).toBeNull()
    expect(queryByRole("status", { name: "Wizard progress" })).toBeNull()
    expect(queryByText("Local")).toBeNull()
    expect(queryByText("Cloud")).toBeNull()
  })

  test("pairs using local endpoint when cloud proxy is unset", async () => {
    const { getByRole, getByText, getByLabelText } = renderConnectWizard()

    await waitFor(() => {
      expect(getByRole("heading", { name: /pair a device/i })).toBeInTheDocument()
    })
    await waitFor(() => {
      expect(getByRole("status", { name: /pairing code/i })).toHaveTextContent("J7K-9P2")
    })
    expect(pairingBodies[0]?.endpoint).toBe("loopback")
    expect(getByText("Configure cloud proxy in Settings")).toBeInTheDocument()
    expect(getByLabelText("QR pairing payload")).toBeInTheDocument()
  })

  test("pairs using advertised endpoint when cloud proxy is configured and enabled", async () => {
    runtimeSettings = {
      ...defaultRuntimeSettings,
      advertisedUrl: "https://agents.example.com",
      advertisedUrlEnabled: true,
    }

    const { getByRole, getByText } = renderConnectWizard()

    await waitFor(() => {
      expect(getByRole("heading", { name: /pair a device/i })).toBeInTheDocument()
    })
    await waitFor(() => {
      expect(getByRole("status", { name: /pairing code/i })).toHaveTextContent("J7K-9P2")
    })
    expect(pairingBodies[0]?.endpoint).toBe("advertised")
    expect(getByText("Change in Settings")).toBeInTheDocument()
  })

  test("pairs using local endpoint when cloud proxy is disabled", async () => {
    runtimeSettings = {
      ...defaultRuntimeSettings,
      advertisedUrl: "https://agents.example.com",
      advertisedUrlEnabled: false,
    }

    const { getByRole, getByText } = renderConnectWizard()

    await waitFor(() => {
      expect(getByRole("heading", { name: /pair a device/i })).toBeInTheDocument()
    })
    await waitFor(() => {
      expect(getByRole("status", { name: /pairing code/i })).toHaveTextContent("J7K-9P2")
    })
    expect(pairingBodies[0]?.endpoint).toBe("loopback")
    expect(getByText("Configure cloud proxy in Settings")).toBeInTheDocument()
  })

  test("regenerate button requests a fresh pairing code", async () => {
    const { getByRole } = renderConnectWizard()

    await waitFor(() => {
      expect(getByRole("status", { name: /pairing code/i })).toHaveTextContent("J7K-9P2")
    })

    fireEvent.click(getByRole("button", { name: /regenerate/i }))

    await waitFor(() => {
      expect(getByRole("status", { name: /pairing code/i })).toHaveTextContent("Q3R-8T6")
    })
    expect(pairingBodies).toHaveLength(2)
  })

  test("paired device event updates status and enables view paired devices button", async () => {
    hasPairedDevice = false

    const { getByRole, getByText } = renderConnectWizard()

    await waitFor(() => {
      expect(getByRole("status", { name: /pairing code/i })).toHaveTextContent("J7K-9P2")
    })

    expect(getByRole("button", { name: /view paired devices/i })).toBeDisabled()

    hasPairedDevice = true

    await waitFor(
      () => {
        expect(getByText("Pixel 9 paired")).toBeInTheDocument()
      },
      { timeout: 5000 },
    )
    expect(getByRole("button", { name: /view paired devices/i })).toBeEnabled()

    fireEvent.click(getByRole("button", { name: /view paired devices/i }))
    expect(getByRole("status", { name: "Current route" })).toHaveTextContent("/devices")
  })

  test("shows error when pairing code generation fails", async () => {
    globalThis.fetch = mock((input: RequestInfo | URL, init?: RequestInit) => {
      const url = requestUrl(input)
      const method = init?.method ?? "GET"

      if (url.startsWith("/v1/settings/runtime") && method === "GET") {
        return Promise.resolve(
          new Response(JSON.stringify(wrapRuntimeSettingsView(runtimeSettings)), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          }),
        )
      }

      if (url === "/v1/pairing-codes" && method === "POST") {
        return Promise.resolve(
          new Response(JSON.stringify({ error: "Failed" }), {
            status: 500,
            headers: { "Content-Type": "application/json" },
          }),
        )
      }

      return Promise.resolve(new Response("not found", { status: 404 }))
    }) as typeof fetch

    const { getByRole } = renderConnectWizard()

    await waitFor(() => {
      expect(getByRole("alert")).toHaveTextContent("Could not create a pairing code.")
    })
  })
})
