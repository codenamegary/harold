import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test"
import React from "react"
import { act, fireEvent, waitFor, within } from "@testing-library/react"
import { useLocation } from "react-router"
import { renderWithProviders } from "../query/render.with.providers"
import { ConnectWizard } from "./ConnectWizard"

const stepRailLabels = [
  /access mode/i,
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

const firstPairingCode = {
  id: "pair_01",
  code: "J7K-9P2",
  endpoint: "http://127.0.0.1:3847",
  state: "active",
  createdAt: "2026-08-02T21:00:00.000Z",
  expiresAt: "2026-08-02T21:10:00.000Z",
} as const

const secondPairingCode = {
  ...firstPairingCode,
  id: "pair_02",
  code: "Q3R-8T6",
  createdAt: "2026-08-02T21:01:00.000Z",
  expiresAt: "2026-08-02T21:11:00.000Z",
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

const requestUrl = (input: RequestInfo | URL): string => {
  if (typeof input === "string") {
    return input
  }

  if (input instanceof URL) {
    return input.href
  }

  return input.url
}

const renderConnectWizard = () =>
  renderWithProviders(<ConnectWizard />, {
    initialEntries: ["/connect"],
  })

describe("ConnectWizard", () => {
  const sockets: FakeSocket[] = []
  const pairingRequests: string[] = []

  beforeEach(() => {
    sockets.length = 0
    pairingRequests.length = 0

    globalThis.WebSocket = function FakeWebSocket(url: string | URL) {
      const socket = createFakeSocket(String(url))
      sockets.push(socket)
      return socket
    } as unknown as typeof WebSocket

    globalThis.fetch = mock((input: RequestInfo | URL, init?: RequestInit) => {
      const url = requestUrl(input)
      const method = init?.method ?? "GET"

      if (url === "/v1/pairing-codes" && method === "POST") {
        pairingRequests.push(url)
        const body = pairingRequests.length === 1 ? firstPairingCode : secondPairingCode
        return Promise.resolve(
          new Response(JSON.stringify(body), {
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
    globalThis.WebSocket = originalWebSocket
  })

  test("renders four navigable step rail buttons", () => {
    const { getByRole } = renderConnectWizard()

    stepRailLabels.forEach((label) => {
      expect(getByRole("button", { name: label })).toBeInTheDocument()
    })
  })

  test("starts on access mode step", () => {
    const { getByRole } = renderConnectWizard()

    expect(getByRole("heading", { name: /how will you connect/i })).toBeInTheDocument()
    expect(getByRole("status", { name: "Wizard progress" })).toHaveTextContent("1 / 4")
  })

  test("opens the pair step directly from the pair query", async () => {
    const { getByRole } = renderWithProviders(<ConnectWizard />, {
      initialEntries: ["/connect?step=pair"],
    })

    expect(getByRole("heading", { name: /pair a device/i })).toBeInTheDocument()
    expect(getByRole("status", { name: "Wizard progress" })).toHaveTextContent("4 / 4")
    await waitFor(() => {
      expect(getByRole("status", { name: /pairing code/i })).toHaveTextContent("J7K-9P2")
    })
  })

  test("navigates between steps via step rail", async () => {
    const { getByRole } = renderConnectWizard()

    fireEvent.click(getByRole("button", { name: /external url/i }))
    expect(getByRole("heading", { name: /configure external access/i })).toBeInTheDocument()
    expect(getByRole("status", { name: "Wizard progress" })).toHaveTextContent("2 / 4")

    fireEvent.click(getByRole("button", { name: /test connection/i }))
    expect(getByRole("heading", { name: /test your connection/i })).toBeInTheDocument()
    expect(getByRole("status", { name: "Wizard progress" })).toHaveTextContent("3 / 4")

    fireEvent.click(getByRole("button", { name: /pair device/i }))
    expect(getByRole("heading", { name: /pair a device/i })).toBeInTheDocument()
    expect(getByRole("status", { name: "Wizard progress" })).toHaveTextContent("4 / 4")
    await waitFor(() => {
      expect(getByRole("status", { name: /pairing code/i })).toHaveTextContent("J7K-9P2")
    })
  })

  test("continue and back buttons move between steps", () => {
    const { getByRole } = renderConnectWizard()

    fireEvent.click(getByRole("button", { name: /continue/i }))
    expect(getByRole("heading", { name: /configure external access/i })).toBeInTheDocument()

    fireEvent.click(getByRole("button", { name: /back/i }))
    expect(getByRole("heading", { name: /how will you connect/i })).toBeInTheDocument()
  })

  test("access mode cards toggle selection visually", () => {
    const { getByRole } = renderConnectWizard()

    const localCard = getByRole("button", { name: /local or private network/i })
    const cloudCard = getByRole("button", { name: /cloud proxy/i })

    expect(localCard).toHaveAttribute("aria-pressed", "true")
    expect(cloudCard).toHaveAttribute("aria-pressed", "false")

    fireEvent.click(cloudCard)
    expect(localCard).toHaveAttribute("aria-pressed", "false")
    expect(cloudCard).toHaveAttribute("aria-pressed", "true")
  })

  test("proxy tabs switch static snippet content", () => {
    const { getByRole } = renderConnectWizard()

    fireEvent.click(getByRole("button", { name: /external url/i }))

    const panel = getByRole("tabpanel")
    expect(within(panel).getByText(/reverse_proxy http:\/\/10\.8\.0\.2:3847/)).toBeInTheDocument()

    fireEvent.click(getByRole("tab", { name: /tailscale/i }))
    expect(within(panel).getByText(/tailscale serve --bg https \/ http:\/\/127\.0\.0\.1:3847/)).toBeInTheDocument()

    fireEvent.click(getByRole("tab", { name: /cloudflare tunnel/i }))
    expect(within(panel).getByText(/service: http:\/\/127\.0\.0\.1:3847/)).toBeInTheDocument()
  })

  test("external URL field is read-only reference text", () => {
    const { getByRole } = renderConnectWizard()

    fireEvent.click(getByRole("button", { name: /external url/i }))

    const urlInput = getByRole("textbox", { name: /public server url/i })
    expect(urlInput).toHaveAttribute("readonly")
    expect(urlInput).toHaveValue("acp.gary.dev")
  })

  test("run connection test button is disabled", () => {
    const { getByRole } = renderConnectWizard()

    fireEvent.click(getByRole("button", { name: /test connection/i }))

    const runTest = getByRole("button", { name: /run connection test/i })
    expect(runTest).toBeDisabled()
  })

  test("creates one pairing code on entering pair step under StrictMode", async () => {
    const { getByRole, getByText } = renderWithProviders(
      <React.StrictMode>
        <ConnectWizard />
      </React.StrictMode>,
      { initialEntries: ["/connect"] },
    )

    fireEvent.click(getByRole("button", { name: /pair device/i }))

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
    expect(getByText("Listening on this local Agent Server endpoint")).toBeInTheDocument()
  })

  test("regenerate mints a fresh pairing code", async () => {
    const { getByRole } = renderConnectWizard()

    fireEvent.click(getByRole("button", { name: /pair device/i }))

    await waitFor(() => {
      expect(getByRole("status", { name: /pairing code/i })).toHaveTextContent("J7K-9P2")
    })

    fireEvent.click(getByRole("button", { name: /regenerate/i }))

    await waitFor(() => {
      expect(getByRole("status", { name: /pairing code/i })).toHaveTextContent("Q3R-8T6")
    })
    expect(pairingRequests).toHaveLength(2)
  })

  test("device paired event enables navigation to Devices", async () => {
    const { getByRole, getByLabelText } = renderWithProviders(
      <>
        <ConnectWizard />
        <LocationProbe />
      </>,
      { initialEntries: ["/connect"] },
    )

    fireEvent.click(getByRole("button", { name: /pair device/i }))

    await waitFor(() => {
      expect(getByRole("status", { name: /pairing code/i })).toHaveTextContent("J7K-9P2")
    })

    const appSocket = sockets.find((socket) => socket.url.includes("/v1/events"))
    expect(appSocket).toBeDefined()

    act(() => {
      appSocket?.dispatch(
        "message",
        JSON.stringify([
          {
            type: "device.paired",
            cursor: "100",
            occurredAt: "2026-08-02T21:02:00.000Z",
            payload: {
              deviceId: "dev_phone",
              name: "Field phone",
              platform: "iOS",
            },
          },
        ]),
      )
    })

    await waitFor(() => {
      expect(getByRole("button", { name: /view paired devices/i })).toBeEnabled()
    })

    fireEvent.click(getByRole("button", { name: /view paired devices/i }))
    expect(getByLabelText("Current route")).toHaveTextContent("/devices")
  })

  test("pair copy is device neutral", async () => {
    const { getByRole, container } = renderConnectWizard()

    fireEvent.click(getByRole("button", { name: /pair device/i }))

    await waitFor(() => {
      expect(getByRole("heading", { name: /pair a device/i })).toBeInTheDocument()
    })

    expect(container.textContent ?? "").not.toMatch(/android/i)
    expect(container.textContent ?? "").toMatch(/device/i)
  })
})
