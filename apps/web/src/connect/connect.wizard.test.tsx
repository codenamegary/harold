import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test"
import React from "react"
import { act, fireEvent, waitFor, within } from "@testing-library/react"
import { useLocation } from "react-router"
import { renderWithProviders } from "../query/render.with.providers"
import { hrefOf, requestBodyText, requestUrl } from "../test/request.url"
import { ConnectWizard } from "./ConnectWizard"

const cloudStepRailLabels = [
  /external url/i,
  /test connection/i,
  /pair device/i,
] as const

type FakeSocket = {
  url: string
  readyState: number
  close: () => void
  send: (data: string) => void
  addEventListener: (type: string, listener: (event: { data?: string }) => void) => void
  dispatch: (type: string, data?: string) => void
}

const originalFetch = globalThis.fetch
const originalWebSocket = globalThis.WebSocket

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

const passingConnectionTest = {
  advertisedUrl: "https://agents.example.com",
  checkedAt: "2026-08-03T12:00:00.000Z",
  checks: [
    { id: "dns", status: "pass", message: "Resolved agents.example.com and reached port 443" },
    { id: "tls", status: "pass", message: "TLS certificate is valid" },
    { id: "device-auth", status: "pass", message: "Bearer authentication succeeded" },
  ],
  canContinue: true,
  canContinueAnyway: false,
} as const

const warningTlsConnectionTest = {
  ...passingConnectionTest,
  checks: [
    passingConnectionTest.checks[0],
    { id: "tls", status: "warn", message: "Certificate is self-signed" },
    passingConnectionTest.checks[2],
  ],
  canContinue: false,
  canContinueAnyway: true,
} as const

const createFakeSocket = (url: string): FakeSocket => {
  const listeners = new Map<string, Array<(event: { data?: string }) => void>>()

  const socket: FakeSocket = {
    url,
    readyState: 1,
    close: () => {
      socket.readyState = 3
    },
    send: () => undefined,
    addEventListener: (type, listener) => {
      const current = listeners.get(type) ?? []
      listeners.set(type, [...current, listener])
    },
    dispatch: (type, data) => {
      const current = listeners.get(type) ?? []
      current.forEach((listener) => listener({ data }))
    },
  }

  return socket
}

const LocationProbe: React.FC = () => {
  const location = useLocation()
  return <output aria-label="Current route">{location.pathname}</output>
}

const continueButtonName = /^Continue$/

const goToCloudExternalUrl = async (
  getByRole: ReturnType<typeof renderWithProviders>["getByRole"],
) => {
  await waitFor(() => {
    expect(getByRole("heading", { name: /pair a device/i })).toBeInTheDocument()
  })
  fireEvent.click(getByRole("button", { name: /set up cloud proxy/i }))
  await waitFor(() => {
    expect(getByRole("textbox", { name: /public server url/i })).toBeInTheDocument()
  })
}

const saveCloudExternalUrl = async (
  getByRole: ReturnType<typeof renderWithProviders>["getByRole"],
  host: string,
) => {
  await act(async () => {
    fireEvent.input(getByRole("textbox", { name: /public server url/i }), {
      target: { value: host },
    })
  })

  await act(async () => {
    fireEvent.click(getByRole("button", { name: /save & continue/i }))
  })

  await waitFor(() => {
    expect(getByRole("heading", { name: /test your connection/i })).toBeInTheDocument()
  })
}

const waitForConnectionTestContinue = async (
  getByRole: ReturnType<typeof renderWithProviders>["getByRole"],
) => {
  await waitFor(() => {
    expect(getByRole("button", { name: continueButtonName })).toBeEnabled()
  })
}

const renderConnectWizard = () =>
  renderWithProviders(<ConnectWizard />, {
    initialEntries: ["/connect"],
  })

describe("ConnectWizard", () => {
  const sockets: FakeSocket[] = []
  const pairingRequests: string[] = []
  const pairingBodies: Array<{ endpoint?: string }> = []
  const runtimeSettingsRequests: string[] = []
  const runtimeSettingsUpdates: Array<{
    advertisedUrl?: string | null
    advertisedUrlEnabled?: boolean
  }> = []
  const connectionTestRequests: string[] = []
  let connectionTestResponse: typeof passingConnectionTest = passingConnectionTest
  let runtimeSettings = { ...defaultRuntimeSettings }
  let deviceCollection = {
    items: [] as Array<{
      id: string
      name: string
      platform: string | null
      state: "online" | "offline" | "revoked"
      pairedAt: string
      lastSeenAt: string | null
    }>,
    page: { limit: 100, count: 0 },
  }

  beforeEach(() => {
    sockets.length = 0
    pairingRequests.length = 0
    pairingBodies.length = 0
    runtimeSettingsRequests.length = 0
    runtimeSettingsUpdates.length = 0
    connectionTestRequests.length = 0
    connectionTestResponse = passingConnectionTest
    runtimeSettings = { ...defaultRuntimeSettings }
    deviceCollection = { items: [], page: { limit: 100, count: 0 } }

    globalThis.WebSocket = function FakeWebSocket(url: string | URL) {
      const socket = createFakeSocket(hrefOf(url))
      sockets.push(socket)
      return socket
    } as unknown as typeof WebSocket

    globalThis.fetch = mock((input: RequestInfo | URL, init?: RequestInit) => {
      const url = requestUrl(input)
      const method = init?.method ?? "GET"

      if (url === "/v1/settings/runtime" && method === "GET") {
        runtimeSettingsRequests.push("GET")
        return Promise.resolve(
          new Response(JSON.stringify(wrapRuntimeSettingsView(runtimeSettings)), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          }),
        )
      }

      if (url === "/v1/settings/runtime" && method === "PATCH") {
        runtimeSettingsRequests.push("PATCH")
        const body = JSON.parse(requestBodyText(init?.body)) as {
          advertisedUrl?: string | null
          advertisedUrlEnabled?: boolean
        }
        runtimeSettingsUpdates.push(body)
        runtimeSettings = {
          ...runtimeSettings,
          advertisedUrl:
            body.advertisedUrl === undefined ? runtimeSettings.advertisedUrl : body.advertisedUrl,
          advertisedUrlEnabled:
            body.advertisedUrlEnabled === undefined
              ? runtimeSettings.advertisedUrlEnabled
              : body.advertisedUrlEnabled,
        }
        return Promise.resolve(
          new Response(JSON.stringify(wrapRuntimeSettingsView(runtimeSettings)), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          }),
        )
      }

      if (url === "/v1/connection-test" && method === "POST") {
        connectionTestRequests.push(url)
        return Promise.resolve(
          new Response(JSON.stringify(connectionTestResponse), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          }),
        )
      }

      if (url === "/v1/pairing-codes" && method === "POST") {
        pairingRequests.push(url)
        const parsed = JSON.parse(requestBodyText(init?.body) || "{}") as {
          endpoint?: string
        }
        pairingBodies.push(parsed)
        const useAdvertised =
          parsed.endpoint === "advertised" ||
          (parsed.endpoint !== "loopback" &&
            runtimeSettings.advertisedUrl !== null &&
            runtimeSettings.advertisedUrlEnabled)
        const body = useAdvertised
          ? advertisedPairingCode
          : pairingRequests.length === 1
            ? firstPairingCode
            : secondPairingCode
        return Promise.resolve(
          new Response(JSON.stringify(body), {
            status: 201,
            headers: { "Content-Type": "application/json" },
          }),
        )
      }

      if (url.startsWith("/v1/devices") && method === "GET") {
        return Promise.resolve(
          new Response(JSON.stringify(deviceCollection), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          }),
        )
      }

      return Promise.resolve(new Response("not found", { status: 404 }))
    }) as typeof fetch
  })

  afterEach(() => {
    globalThis.fetch = originalFetch
    globalThis.WebSocket = originalWebSocket
  })

  test("lands on pair without cloud step rail", async () => {
    const { getByRole, queryByRole } = renderConnectWizard()

    await waitFor(() => {
      expect(getByRole("heading", { name: /pair a device/i })).toBeInTheDocument()
    })
    expect(getByRole("button", { name: /set up cloud proxy/i })).toBeInTheDocument()
    expect(queryByRole("button", { name: /external url/i })).toBeNull()
    expect(queryByRole("status", { name: "Wizard progress" })).toBeNull()
    expect(queryByRole("heading", { name: /how will you connect/i })).toBeNull()
  })

  test("saved cloud proxy defaults pairing to the advertised endpoint", async () => {
    runtimeSettings = {
      ...defaultRuntimeSettings,
      advertisedUrl: "https://agents.example.com",
      advertisedUrlEnabled: true,
    }

    const { getByRole, getByText, queryByRole } = renderConnectWizard()

    await waitFor(() => {
      expect(getByRole("heading", { name: /pair a device/i })).toBeInTheDocument()
    })
    expect(getByRole("button", { name: /cloud proxy/i })).toHaveAttribute("aria-pressed", "true")
    expect(getByText("Cloud")).toBeInTheDocument()
    expect(getByText("https://agents.example.com")).toBeInTheDocument()
    expect(queryByRole("heading", { name: /cloud proxy connected/i })).toBeNull()
    await waitFor(() => {
      expect(getByRole("status", { name: /pairing code/i })).toHaveTextContent("J7K-9P2")
    })
    expect(pairingBodies[0]?.endpoint).toBe("advertised")
  })

  test("this machine pairing keeps the saved advertised URL", async () => {
    runtimeSettings = {
      ...defaultRuntimeSettings,
      advertisedUrl: "https://agents.example.com",
      advertisedUrlEnabled: true,
    }

    const { getByRole } = renderConnectWizard()

    await waitFor(() => {
      expect(getByRole("button", { name: /this machine/i })).toBeInTheDocument()
    })
    fireEvent.click(getByRole("button", { name: /this machine/i }))

    await waitFor(() => {
      expect(pairingBodies.some((body) => body.endpoint === "loopback")).toBe(true)
    })
    expect(runtimeSettings.advertisedUrl).toBe("https://agents.example.com")
    expect(runtimeSettingsUpdates).toEqual([])
  })

  test("opens the pair step from the pair query without clearing advertised URL", async () => {
    runtimeSettings = {
      ...defaultRuntimeSettings,
      advertisedUrl: "https://agents.example.com",
      advertisedUrlEnabled: true,
    }

    const { getByRole, queryByRole } = renderWithProviders(<ConnectWizard />, {
      initialEntries: ["/connect?step=pair"],
    })

    await waitFor(() => {
      expect(getByRole("heading", { name: /pair a device/i })).toBeInTheDocument()
    })
    expect(runtimeSettingsUpdates).toEqual([])
    expect(runtimeSettings.advertisedUrl).toBe("https://agents.example.com")
    expect(queryByRole("status", { name: "Wizard progress" })).toBeNull()
  })

  test("cloud continue shows three-step rail and external URL step", async () => {
    const { getByRole } = renderConnectWizard()

    await goToCloudExternalUrl(getByRole)

    cloudStepRailLabels.forEach((label) => {
      expect(getByRole("button", { name: label })).toBeInTheDocument()
    })
    expect(getByRole("status", { name: "Wizard progress" })).toHaveTextContent("1 / 3")
    expect(getByRole("heading", { name: /configure external access/i })).toBeInTheDocument()
  })

  test("cloud external URL saves on continue", async () => {
    const { getByRole } = renderConnectWizard()

    await goToCloudExternalUrl(getByRole)
    await saveCloudExternalUrl(getByRole, "edge.example.com")
    expect(runtimeSettingsUpdates).toEqual([
      { advertisedUrl: "https://edge.example.com", advertisedUrlEnabled: true },
    ])
    expect(runtimeSettings.advertisedUrl).toBe("https://edge.example.com")
  })

  test("cloud external URL blocks empty host", async () => {
    const { getByRole, getByText } = renderConnectWizard()

    await goToCloudExternalUrl(getByRole)

    fireEvent.input(getByRole("textbox", { name: /public server url/i }), {
      target: { value: "   " },
    })
    fireEvent.click(getByRole("button", { name: /save & continue/i }))

    expect(getByText(/enter a public hostname/i)).toBeInTheDocument()
  })

  test("cloud test step auto-runs connection test and gates continue", async () => {
    const { getByRole, getByText } = renderConnectWizard()

    await goToCloudExternalUrl(getByRole)
    await saveCloudExternalUrl(getByRole, "agents.example.com")

    expect(runtimeSettingsRequests).toContain("PATCH")
    await waitFor(() => {
      expect(connectionTestRequests).toHaveLength(1)
    })
    expect(getByText(/resolved agents\.example\.com/i)).toBeInTheDocument()
    expect(getByRole("button", { name: continueButtonName })).toBeEnabled()

    fireEvent.click(getByRole("button", { name: continueButtonName }))
    expect(getByRole("heading", { name: /pair a device/i })).toBeInTheDocument()
  })

  test("cloud test step shows continue anyway for self-signed TLS warning", async () => {
    connectionTestResponse = warningTlsConnectionTest
    const { getByRole } = renderConnectWizard()

    await goToCloudExternalUrl(getByRole)
    await saveCloudExternalUrl(getByRole, "agents.example.com")

    await waitFor(() => {
      expect(getByRole("button", { name: /continue anyway/i })).toBeInTheDocument()
    })
    expect(getByRole("button", { name: continueButtonName })).toBeDisabled()
  })

  test("cloud pair uses advertised endpoint label", async () => {
    const { getByRole, getByText } = renderConnectWizard()

    await goToCloudExternalUrl(getByRole)
    await saveCloudExternalUrl(getByRole, "agents.example.com")
    await waitForConnectionTestContinue(getByRole)
    fireEvent.click(getByRole("button", { name: continueButtonName }))

    await waitFor(() => {
      expect(getByRole("status", { name: /pairing code/i })).toHaveTextContent("J7K-9P2")
    })
    expect(getByText("https://agents.example.com")).toBeInTheDocument()
  })

  test("wizard finish returns to pair landing", async () => {
    const { getByRole, queryByRole } = renderConnectWizard()

    await goToCloudExternalUrl(getByRole)
    await saveCloudExternalUrl(getByRole, "agents.example.com")
    await waitForConnectionTestContinue(getByRole)
    fireEvent.click(getByRole("button", { name: continueButtonName }))

    await waitFor(() => {
      expect(getByRole("button", { name: /^Finish$/i })).toBeEnabled()
    })
    fireEvent.click(getByRole("button", { name: /^Finish$/i }))

    await waitFor(() => {
      expect(queryByRole("status", { name: "Wizard progress" })).toBeNull()
    })
    expect(getByRole("heading", { name: /pair a device/i })).toBeInTheDocument()
    expect(getByRole("button", { name: /cloud proxy/i })).toHaveAttribute("aria-pressed", "true")
  })

  test("disabled cloud proxy pairs locally and can be turned on", async () => {
    runtimeSettings = {
      ...defaultRuntimeSettings,
      advertisedUrl: "https://agents.example.com",
      advertisedUrlEnabled: false,
    }

    const { getByRole } = renderConnectWizard()

    await waitFor(() => {
      expect(getByRole("button", { name: /use cloud proxy/i })).toBeInTheDocument()
    })
    await waitFor(() => {
      expect(pairingBodies[0]?.endpoint).toBe("loopback")
    })

    fireEvent.click(getByRole("button", { name: /use cloud proxy/i }))

    await waitFor(() => {
      expect(runtimeSettingsUpdates).toEqual([{ advertisedUrlEnabled: true }])
    })
  })

  test("proxy tabs switch static snippet content", async () => {
    const { getByRole } = renderConnectWizard()

    await goToCloudExternalUrl(getByRole)

    const panel = getByRole("tabpanel")
    expect(within(panel).getByText(/reverse_proxy http:\/\/10\.8\.0\.2:3847/)).toBeInTheDocument()

    fireEvent.click(getByRole("tab", { name: /tailscale/i }))
    expect(within(panel).getByText(/tailscale serve --bg https \/ http:\/\/127\.0\.0\.1:3847/)).toBeInTheDocument()

    fireEvent.click(getByRole("tab", { name: /cloudflare tunnel/i }))
    expect(within(panel).getByText(/service: http:\/\/127\.0\.0\.1:3847/)).toBeInTheDocument()
  })

  test("proxy template copy button writes the snippet to the clipboard", async () => {
    const writeText = mock(() => Promise.resolve())
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    })

    const { getByRole } = renderConnectWizard()

    await goToCloudExternalUrl(getByRole)
    fireEvent.click(getByRole("button", { name: /^Copy$/i }))

    await waitFor(() => {
      expect(writeText).toHaveBeenCalledTimes(1)
    })
    expect(String(writeText.mock.calls[0]?.[0] ?? "")).toContain(
      "reverse_proxy http://10.8.0.2:3847",
    )
  })

  test("cloud test step shows live check results", async () => {
    const { getByRole, getAllByText } = renderConnectWizard()

    await goToCloudExternalUrl(getByRole)
    await saveCloudExternalUrl(getByRole, "agents.example.com")

    await waitFor(() => {
      expect(getAllByText(/passed/i).length).toBeGreaterThanOrEqual(3)
    })
    expect(
      getByRole("button", { name: /refresh connection test/i }),
    ).toBeInTheDocument()
  })

  test("cloud test refresh clears checks and spins until complete", async () => {
    let releaseSecondTest: (() => void) | undefined
    const secondTestGate = new Promise<void>((resolve) => {
      releaseSecondTest = resolve
    })

    const baseFetch = globalThis.fetch
    globalThis.fetch = mock((input: RequestInfo | URL, init?: RequestInit) => {
      const url = requestUrl(input)
      const method = init?.method ?? "GET"

      if (url === "/v1/connection-test" && method === "POST") {
        connectionTestRequests.push(url)
        if (connectionTestRequests.length === 1) {
          return Promise.resolve(
            new Response(JSON.stringify(passingConnectionTest), {
              status: 200,
              headers: { "Content-Type": "application/json" },
            }),
          )
        }

        return secondTestGate.then(
          () =>
            new Response(JSON.stringify(passingConnectionTest), {
              status: 200,
              headers: { "Content-Type": "application/json" },
            }),
        )
      }

      return baseFetch(input, init)
    }) as typeof fetch

    const { getByRole, getAllByText, queryAllByText } = renderConnectWizard()

    await goToCloudExternalUrl(getByRole)
    await saveCloudExternalUrl(getByRole, "agents.example.com")
    await waitForConnectionTestContinue(getByRole)

    fireEvent.click(getByRole("button", { name: /refresh connection test/i }))

    await waitFor(() => {
      expect(connectionTestRequests).toHaveLength(2)
    })
    expect(getByRole("button", { name: /refreshing connection test/i })).toBeDisabled()
    expect(getByRole("button", { name: continueButtonName })).toBeDisabled()
    expect(getAllByText(/checking…/i).length).toBe(3)
    expect(queryAllByText(/passed/i)).toHaveLength(0)

    releaseSecondTest?.()
    await waitForConnectionTestContinue(getByRole)
    expect(getByRole("button", { name: /refresh connection test/i })).toBeEnabled()
  })

  test("creates one pairing code on entering pair step under StrictMode", async () => {
    const { getByRole, getByText } = renderWithProviders(
      <React.StrictMode>
        <ConnectWizard />
      </React.StrictMode>,
      { initialEntries: ["/connect"] },
    )

    await waitFor(() => {
      expect(getByRole("heading", { name: /pair a device/i })).toBeInTheDocument()
    })

    await waitFor(() => {
      expect(getByRole("status", { name: /pairing code/i })).toHaveTextContent("J7K-9P2")
    })
    expect(pairingRequests).toHaveLength(1)
    expect(getByRole("img", { name: "QR pairing payload" })).toBeInTheDocument()
    await waitFor(() => {
      expect(getByRole("button", { name: /regenerate/i })).toBeEnabled()
    })
    expect(getByRole("button", { name: /view paired devices/i })).toBeDisabled()
    expect(getByText("Expires at 2026-08-02T21:10:00.000Z")).toBeInTheDocument()
    expect(getByText("http://127.0.0.1:3847")).toBeInTheDocument()
  })

  test("regenerate mints a fresh pairing code", async () => {
    const { getByRole } = renderConnectWizard()

    await waitFor(() => {
      expect(getByRole("heading", { name: /pair a device/i })).toBeInTheDocument()
    })

    await waitFor(() => {
      expect(getByRole("status", { name: /pairing code/i })).toHaveTextContent("J7K-9P2")
    })

    fireEvent.click(getByRole("button", { name: /regenerate/i }))

    await waitFor(() => {
      expect(getByRole("status", { name: /pairing code/i })).toHaveTextContent("Q3R-8T6")
    })
    expect(pairingRequests).toHaveLength(2)
  })

  test("device list poll enables navigation to Devices after pair", async () => {
    const { getByRole, getByLabelText } = renderWithProviders(
      <>
        <ConnectWizard />
        <LocationProbe />
      </>,
      { initialEntries: ["/connect"] },
    )

    await waitFor(() => {
      expect(getByRole("heading", { name: /pair a device/i })).toBeInTheDocument()
    })

    await waitFor(() => {
      expect(getByRole("status", { name: /pairing code/i })).toHaveTextContent("J7K-9P2")
    })

    expect(sockets.some((socket) => socket.url.includes("/v1/events"))).toBe(false)

    deviceCollection = {
      items: [
        {
          id: "dev_phone",
          name: "Field phone",
          platform: "iOS",
          state: "online",
          pairedAt: "2026-08-02T21:02:00.000Z",
          lastSeenAt: "2026-08-02T21:02:00.000Z",
        },
      ],
      page: { limit: 100, count: 1 },
    }

    await waitFor(
      () => {
        expect(getByRole("button", { name: /view paired devices/i })).toBeEnabled()
      },
      { timeout: 5000 },
    )

    fireEvent.click(getByRole("button", { name: /view paired devices/i }))
    expect(getByLabelText("Current route")).toHaveTextContent("/devices")
  })

  test("pair copy is device neutral", async () => {
    const { getByRole, container } = renderConnectWizard()

    await waitFor(() => {
      expect(getByRole("heading", { name: /pair a device/i })).toBeInTheDocument()
    })

    expect(container.textContent ?? "").not.toMatch(/android/i)
    expect(container.textContent ?? "").toMatch(/device/i)
  })
})
