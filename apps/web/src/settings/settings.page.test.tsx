import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test"
import { fireEvent, waitFor } from "@testing-library/react"
import { renderWithProviders } from "../query/render.with.providers"
import { requestBodyText } from "../test/request.url"
import { SettingsPage } from "../shell/pages/SettingsPage"

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

const validRuntimeSettings = {
  advertisedUrl: null,
  trustedProxies: [] as string[],
  bindHost: "127.0.0.1" as const,
  bindPort: 3847,
  logLevel: "info" as const,
  logPath: null as string | null,
  allowedRoots: [] as string[],
}

const wrapRuntimeSettingsView = (
  settings: typeof validRuntimeSettings,
  options?: {
    restartRequired?: boolean
    overrides?: { bindPort?: "env" }
    effectivePort?: number
    effectiveLogPath?: string | null
  },
) => ({
  settings,
  restartRequired: options?.restartRequired ?? false,
  effective: {
    bindHost: settings.bindHost,
    bindPort: options?.effectivePort ?? settings.bindPort,
    logPath:
      options?.effectiveLogPath === undefined
        ? settings.logPath
        : options.effectiveLogPath,
  },
  overrides: options?.overrides ?? {},
})

const originalFetch = globalThis.fetch

const renderSettingsPage = async () => {
  const view = renderWithProviders(<SettingsPage />, {
    initialEntries: ["/settings"],
  })

  await waitFor(() => {
    expect(view.getByRole("region", { name: "Server details" })).toHaveTextContent(
      "http://127.0.0.1:3847",
    )
  })

  return view
}

describe("SettingsPage", () => {
  let runtimeSettings = { ...validRuntimeSettings }
  let appliedBindPort = validRuntimeSettings.bindPort
  let appliedLogPath: string | null = validRuntimeSettings.logPath
  const patchBodies: unknown[] = []

  beforeEach(() => {
    runtimeSettings = { ...validRuntimeSettings }
    appliedBindPort = validRuntimeSettings.bindPort
    appliedLogPath = validRuntimeSettings.logPath
    patchBodies.length = 0

    globalThis.fetch = mock((input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url
      const method = init?.method ?? "GET"

      const buildView = () =>
        wrapRuntimeSettingsView(runtimeSettings, {
          restartRequired:
            runtimeSettings.bindPort !== appliedBindPort ||
            runtimeSettings.logPath !== appliedLogPath,
          effectivePort: appliedBindPort,
          effectiveLogPath: appliedLogPath,
        })

      if (url.startsWith("/v1/settings/runtime") && method === "GET") {
        return Promise.resolve(
          new Response(JSON.stringify(buildView()), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          }),
        )
      }

      if (url.startsWith("/v1/settings/runtime") && method === "PATCH") {
        const body: unknown = JSON.parse(requestBodyText(init?.body))
        patchBodies.push(body)
        runtimeSettings = {
          ...runtimeSettings,
          ...(body as Partial<typeof runtimeSettings>),
        }
        return Promise.resolve(
          new Response(JSON.stringify(buildView()), {
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
  })

  afterEach(() => {
    globalThis.fetch = originalFetch
  })

  test("does not render the old page intro description", async () => {
    const { queryByText } = await renderSettingsPage()

    expect(queryByText("Configure runtime behavior and diagnostics.")).not.toBeInTheDocument()
  })

  test("filesystem provider lists roots with add controls", async () => {
    const { getByText, getByRole, queryByText } = await renderSettingsPage()

    expect(queryByText("0 configured")).not.toBeInTheDocument()
    expect(queryByText("WORKSPACE SOURCES")).not.toBeInTheDocument()
    expect(getByText("Workspace provider")).toBeInTheDocument()
    expect(getByText("Local filesystem")).toBeInTheDocument()
    expect(getByText("No allowed roots configured yet.")).toBeInTheDocument()
    expect(getByRole("button", { name: "Add root" })).toBeEnabled()
    expect(getByRole("textbox", { name: "Allowed root path" })).toBeEnabled()
    expect(
      getByRole("button", {
        name: "Register folders from this machine. Paths outside these roots remain unavailable to remote clients.",
      }),
    ).toBeInTheDocument()
  })

  test("github and gitlab providers are greyed with coming soon", async () => {
    const { getAllByText, getByRole } = await renderSettingsPage()

    expect(getAllByText("Coming soon")).toHaveLength(2)
    expect(getByRole("button", { name: "Connect GitHub" })).toBeDisabled()
    expect(getByRole("button", { name: "Connect GitLab" })).toBeDisabled()
  })

  test("runtime panel edits trusted proxies and log level via PATCH", async () => {
    const { getByRole } = await renderSettingsPage()

    fireEvent.change(getByRole("combobox", { name: "Log level" }), {
      target: { value: "debug" },
    })

    await waitFor(() => {
      expect(patchBodies).toContainEqual({ logLevel: "debug" })
    })

    fireEvent.input(getByRole("textbox", { name: "Trusted proxy CIDR" }), {
      target: { value: "10.0.0.0/8" },
    })
    fireEvent.click(getByRole("button", { name: "Add proxy" }))

    await waitFor(() => {
      expect(patchBodies).toContainEqual({ trustedProxies: ["10.0.0.0/8"] })
      expect(getByRole("button", { name: "Remove 10.0.0.0/8" })).toBeInTheDocument()
    })
  })

  test("runtime panel saves bind port and log path via PATCH", async () => {
    const { getByRole } = await renderSettingsPage()

    fireEvent.input(getByRole("textbox", { name: "Bind port" }), {
      target: { value: "4000" },
    })
    fireEvent.click(getByRole("button", { name: "Save port" }))

    await waitFor(() => {
      expect(patchBodies).toContainEqual({ bindPort: 4000 })
    })

    fireEvent.input(getByRole("textbox", { name: "Log path" }), {
      target: { value: "/tmp/agent-server.log" },
    })
    fireEvent.click(getByRole("button", { name: "Save path" }))

    await waitFor(() => {
      expect(patchBodies).toContainEqual({ logPath: "/tmp/agent-server.log" })
    })
  })

  test("shows restart warning after bind port PATCH returns restartRequired", async () => {
    const { getByRole } = await renderSettingsPage()

    fireEvent.input(getByRole("textbox", { name: "Bind port" }), {
      target: { value: "4000" },
    })
    fireEvent.click(getByRole("button", { name: "Save port" }))

    await waitFor(() => {
      expect(
        getByRole("status", { name: "" }),
      ).toHaveTextContent("Restart the server process to apply bind or log path changes.")
    })
  })

  test("download diagnostics button is disabled", async () => {
    const { getByRole } = await renderSettingsPage()

    expect(getByRole("button", { name: "Download diagnostics" })).toBeDisabled()
  })

  test("shows live endpoint and version when server is online", async () => {
    const { getByRole } = await renderSettingsPage()

    const details = getByRole("region", { name: "Server details" })

    expect(details).toHaveTextContent("http://127.0.0.1:3847")
    expect(details).toHaveTextContent("0.1.0")
    expect(details).toHaveTextContent("—")
  })

  test("shows em dashes when server is unreachable", async () => {
    globalThis.fetch = mock(() => Promise.reject(new Error("network error"))) as typeof fetch

    const { getByRole } = renderWithProviders(<SettingsPage />, {
      initialEntries: ["/settings"],
    })

    await waitFor(() => {
      const details = getByRole("region", { name: "Server details" })
      const emDashes = details.textContent?.match(/—/g) ?? []
      expect(emDashes.length).toBeGreaterThanOrEqual(3)
    })
  })
})
