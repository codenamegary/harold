import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test"
import { WorkspaceCollectionSchema } from "contracts/http/workspace"
import { DeviceCollectionSchema } from "contracts/http/device"
import { fireEvent, waitFor, within, act } from "@testing-library/react"
import { renderWithProviders } from "../query/render.with.providers"
import { AppRoutes } from "./AppRouter"

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

const shellRoutes = [
  { path: "/" },
  { path: "/connect" },
  { path: "/workspaces" },
  { path: "/devices" },
  { path: "/chat" },
  { path: "/settings" },
] as const

const forbiddenLabelPatterns = [/demo data/i, /mock-success/i, /mock success/i] as const

const emptyWorkspaceCollection = WorkspaceCollectionSchema.parse({
  items: [],
  page: { limit: 20, count: 0 },
})

const emptyDeviceCollection = DeviceCollectionSchema.parse({
  items: [],
  page: { limit: 100, count: 0 },
})

const pairingCode = {
  id: "pair_01",
  code: "J7K-9P2",
  endpoint: "http://127.0.0.1:3847",
  state: "active",
  createdAt: "2026-08-02T21:00:00.000Z",
  expiresAt: "2026-08-02T21:10:00.000Z",
} as const

const originalFetch = globalThis.fetch
const originalWebSocket = globalThis.WebSocket

const renderShellRoute = (path: string) =>
  renderWithProviders(<AppRoutes />, {
    initialEntries: [path],
  })

const requestUrl = (input: RequestInfo | URL): string => {
  if (typeof input === "string") {
    return input
  }

  if (input instanceof URL) {
    return input.href
  }

  return input.url
}

const waitForShellReady = async (getByRole: ReturnType<typeof renderWithProviders>["getByRole"]) => {
  await waitFor(() => {
    expect(getByRole("main")).toBeInTheDocument()
  })
}

const emptyAgentCollection = {
  items: [
    {
      id: "cursor",
      displayName: "Cursor",
      available: true,
      enabled: false,
      path: null,
    },
    {
      id: "claude",
      displayName: "Claude",
      available: false,
      enabled: false,
      path: null,
    },
  ],
}

describe("shell honesty", () => {
  let runtimeSettings = {
    advertisedUrl: null as string | null,
    trustedProxies: [] as string[],
    bindHost: "127.0.0.1",
    bindPort: 3847,
    logLevel: "info",
    logPath: null as string | null,
    allowedRoots: [] as string[],
  }

  beforeEach(() => {
    runtimeSettings = {
      advertisedUrl: null,
      trustedProxies: [],
      bindHost: "127.0.0.1",
      bindPort: 3847,
      logLevel: "info",
      logPath: null,
      allowedRoots: [],
    }

    globalThis.WebSocket = function FakeWebSocket(url: string | URL) {
      return {
        url: String(url),
        readyState: 1,
        close: () => undefined,
        send: () => undefined,
        addEventListener: () => undefined,
      }
    } as unknown as typeof WebSocket

    globalThis.fetch = mock((input: RequestInfo | URL, init?: RequestInit) => {
      const url = requestUrl(input)
      const method = init?.method ?? "GET"

      if (url.startsWith("/v1/workspaces")) {
        return Promise.resolve(
          new Response(JSON.stringify(emptyWorkspaceCollection), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          }),
        )
      }

      if (url.startsWith("/v1/devices")) {
        return Promise.resolve(
          new Response(JSON.stringify(emptyDeviceCollection), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          }),
        )
      }

      if (url === "/v1/pairing-codes" && method === "POST") {
        return Promise.resolve(
          new Response(JSON.stringify(pairingCode), {
            status: 201,
            headers: { "Content-Type": "application/json" },
          }),
        )
      }

      if (url.startsWith("/v1/settings/agents")) {
        return Promise.resolve(
          new Response(JSON.stringify(emptyAgentCollection), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          }),
        )
      }

      if (url.startsWith("/v1/sessions")) {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              items: [],
              page: { limit: 100, count: 0 },
            }),
            {
              status: 200,
              headers: { "Content-Type": "application/json" },
            },
          ),
        )
      }

      if (url === "/v1/settings/runtime" && method === "GET") {
        return Promise.resolve(
          new Response(JSON.stringify(runtimeSettings), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          }),
        )
      }

      if (url === "/v1/settings/runtime" && method === "PATCH") {
        const body = JSON.parse(String(init?.body ?? "{}")) as {
          advertisedUrl?: string | null
        }
        runtimeSettings = {
          ...runtimeSettings,
          advertisedUrl:
            body.advertisedUrl === undefined ? runtimeSettings.advertisedUrl : body.advertisedUrl,
        }
        return Promise.resolve(
          new Response(
            JSON.stringify({ settings: runtimeSettings, restartRequired: false }),
            {
              status: 200,
              headers: { "Content-Type": "application/json" },
            },
          ),
        )
      }

      if (url === "/v1/connection-test" && method === "POST") {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              advertisedUrl: "https://agents.example.com",
              checkedAt: "2026-08-03T12:00:00.000Z",
              checks: [
                { id: "dns", status: "pass", message: "Resolved agents.example.com" },
                { id: "tls", status: "pass", message: "TLS certificate is valid" },
                { id: "device-auth", status: "pass", message: "Bearer authentication succeeded" },
              ],
              canContinue: true,
              canContinueAnyway: false,
            }),
            {
              status: 200,
              headers: { "Content-Type": "application/json" },
            },
          ),
        )
      }

      return Promise.resolve(
        new Response(JSON.stringify(validStatus), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      )
    }) as typeof fetch
  })

  afterEach(() => {
    globalThis.fetch = originalFetch
    globalThis.WebSocket = originalWebSocket
  })

  describe("forbidden labels", () => {
    shellRoutes.forEach(({ path }) => {
      test(`route ${path} has no demo or mock-success labels`, async () => {
        const { container, getByRole } = renderShellRoute(path)

        await waitForShellReady(getByRole)

        const text = container.textContent ?? ""

        forbiddenLabelPatterns.forEach((pattern) => {
          expect(text).not.toMatch(pattern)
        })
      })
    })
  })

  describe("overview disabled honesty", () => {
    test("coming soon metric cards show muted copy without numeric placeholders", async () => {
      const { getByRole } = renderShellRoute("/")

      await waitFor(() => {
        expect(getByRole("article", { name: "Server status" })).toHaveTextContent("Online")
      })

      const comingSoonCards = ["ACP runtime", "Active now", "Requests today"] as const

      comingSoonCards.forEach((cardName) => {
        const card = getByRole("article", { name: cardName })

        expect(within(card).getByText("Coming soon")).toBeInTheDocument()
        expect(within(card).queryByText(/\d/)).not.toBeInTheDocument()
      })
    })
  })

  describe("connect wizard functional honesty", () => {
    test("test connection gates continue while pair uses real claim gating", async () => {
      const { getByRole } = renderShellRoute("/connect")

      await waitForShellReady(getByRole)

      fireEvent.click(getByRole("button", { name: /cloud proxy/i }))
      fireEvent.click(getByRole("button", { name: /^Continue$/ }))
      await waitFor(() => {
        expect(getByRole("textbox", { name: /public server url/i })).toBeInTheDocument()
      })
      fireEvent.input(getByRole("textbox", { name: /public server url/i }), {
        target: { value: "agents.example.com" },
      })
      await act(async () => {
        fireEvent.click(getByRole("button", { name: /save & continue/i }))
      })

      await waitFor(() => {
        expect(getByRole("heading", { name: /test your connection/i })).toBeInTheDocument()
      })
      await waitFor(() => {
        expect(getByRole("button", { name: /^Run$/i })).toBeInTheDocument()
      })
      await waitFor(() => {
        expect(getByRole("button", { name: /^Continue$/ })).toBeEnabled()
      }, { timeout: 5000 })

      fireEvent.click(getByRole("button", { name: /^Continue$/ }))
      await waitFor(() => {
        expect(getByRole("button", { name: /regenerate/i })).toBeEnabled()
      })
      expect(getByRole("button", { name: /view paired devices/i })).toBeDisabled()
    })
  })

  describe("workspaces functional honesty", () => {
    test("workspace controls are enabled and list loads from the API", async () => {
      const { getByRole, getByText } = renderShellRoute("/workspaces")

      await waitForShellReady(getByRole)

      expect(getByRole("button", { name: "+ Add workspace" })).toBeEnabled()
      expect(getByRole("searchbox", { name: "Search workspaces" })).toBeEnabled()
      expect(getByRole("button", { name: "All" })).toBeEnabled()
      expect(getByRole("button", { name: "Available" })).toBeEnabled()
      expect(getByRole("button", { name: "Missing" })).toBeEnabled()
      expect(getByRole("button", { name: "Unavailable" })).toBeEnabled()

      await waitFor(() => {
        expect(getByText("No workspaces registered yet.")).toBeInTheDocument()
      })
    })

    test("unregister control is visible when workspaces exist", async () => {
      const listCollection = WorkspaceCollectionSchema.parse({
        items: [
          {
            id: "ws-agent-server",
            name: "agent-server",
            path: "/home/operator/agent-server",
            state: "available",
            createdAt: "2026-07-24T12:00:00.000Z",
            lastUsedAt: "2026-07-24T12:05:00.000Z",
          },
        ],
        page: { limit: 20, count: 1 },
      })

      globalThis.fetch = mock((input: RequestInfo | URL) => {
        const url = requestUrl(input)

        if (url.startsWith("/v1/workspaces")) {
          return Promise.resolve(
            new Response(JSON.stringify(listCollection), {
              status: 200,
              headers: { "Content-Type": "application/json" },
            }),
          )
        }

        return Promise.resolve(
          new Response(JSON.stringify(validStatus), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          }),
        )
      }) as typeof fetch

      const { getByRole } = renderShellRoute("/workspaces")

      await waitForShellReady(getByRole)

      await waitFor(() => {
        expect(getByRole("button", { name: "Unregister agent-server" })).toBeInTheDocument()
      })
    })
  })

  describe("devices disabled honesty", () => {
    test("pair action is enabled and empty lists do not invent revoke actions", async () => {
      const { getByRole, queryByRole } = renderShellRoute("/devices")

      await waitForShellReady(getByRole)

      expect(getByRole("button", { name: "+ Pair new device" })).toBeEnabled()
      expect(queryByRole("button", { name: /revoke/i })).not.toBeInTheDocument()
    })
  })

  describe("settings disabled honesty", () => {
    test("runtime toggles, diagnostics, and provider connect actions are disabled", async () => {
      const { getByRole } = renderShellRoute("/settings")

      await waitForShellReady(getByRole)

      expect(getByRole("checkbox", { name: /allow local network/i })).toBeDisabled()
      expect(getByRole("checkbox", { name: /detailed request logs/i })).toBeDisabled()
      expect(getByRole("button", { name: "Download diagnostics" })).toBeDisabled()
      expect(getByRole("button", { name: "Connect GitHub" })).toBeDisabled()
      expect(getByRole("button", { name: "Connect GitLab" })).toBeDisabled()
    })
  })

  describe("chat disabled honesty", () => {
    test("composer send stays gated until workspace and agent are chosen", async () => {
      const { getByRole, queryByRole, queryByText } = renderShellRoute("/chat")

      await waitForShellReady(getByRole)

      expect(getByRole("combobox", { name: "Workspace" })).not.toBeDisabled()
      expect(getByRole("combobox", { name: "Agent" })).not.toBeDisabled()
      expect(getByRole("combobox", { name: "Session" })).toBeDisabled()
      expect(getByRole("textbox", { name: "Chat message" })).toBeDisabled()
      expect(getByRole("button", { name: "Send message" })).toBeDisabled()
      expect(queryByRole("menu", { name: "Slash commands" })).not.toBeInTheDocument()
      expect(queryByRole("button", { name: "Add attachment" })).not.toBeInTheDocument()
      expect(queryByRole("button", { name: "Clear chat" })).not.toBeInTheDocument()
      expect(queryByText("ACP v0.8")).not.toBeInTheDocument()
    })
  })

  describe("shell status chrome", () => {
    test("status pill tooltip is Status, not JSON Server", async () => {
      const { getByRole, getByTitle, queryByTitle } = renderShellRoute("/")

      await waitForShellReady(getByRole)

      expect(getByTitle("Status")).toBeInTheDocument()
      expect(queryByTitle("JSON Server API status")).not.toBeInTheDocument()
    })
  })
})
