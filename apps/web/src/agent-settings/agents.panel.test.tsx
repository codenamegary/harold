import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test"
import { act, fireEvent, waitFor, within } from "@testing-library/react"
import {
  AgentSettings,
  AgentSettingsCollectionSchema,
  AgentSettingsSchema,
} from "contracts/http/agent-settings"
import { PROBLEM_TYPES } from "contracts/http/error"
import { renderWithProviders } from "../query/render.with.providers"
import { requestBodyText, requestUrl } from "../test/request.url"
import { AgentsPanel } from "./AgentsPanel"

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

const mutationFlowTimeoutMs = 15000

const comingSoonAgent: AgentSettings = {
  id: "claude-acp",
  displayName: "Claude Agent",
  available: false,
  enabled: false,
  path: null,
  args: [],
  present: true,
  popular: true,
}

const cursorAgent = (overrides: Partial<AgentSettings> = {}): AgentSettings => ({
  id: "cursor",
  displayName: "Cursor",
  available: true,
  enabled: false,
  path: null,
  args: [],
  present: true,
  popular: true,
  ...overrides,
})

const agentsCollection = (cursor: AgentSettings) =>
  AgentSettingsCollectionSchema.parse({
    items: [cursor, comingSoonAgent],
  })

const originalFetch = globalThis.fetch

const autoDetectFailedProblem = {
  type: PROBLEM_TYPES.validationError,
  title: "Could not detect agent path automatically.",
  status: 400,
  code: "validation.field.path.auto_detect_failed",
  errors: [{ pointer: "#/path", code: "validation.field.path.auto_detect_failed" }],
}

const renderAgentsPanel = () => renderWithProviders(<AgentsPanel />)

const clickInAct = async (element: HTMLElement) => {
  await act(async () => {
    fireEvent.click(element)
  })
}

const flushDetectSuccessFeedback = async (row: HTMLElement) => {
  const checkmark = row.querySelector(".animate-detect-path-check")

  if (!checkmark) {
    return
  }

  await act(async () => {
    fireEvent.animationEnd(checkmark)
  })
}

const setInputValue = async (input: HTMLElement, value: string) => {
  const inputElement = input as HTMLInputElement

  await act(async () => {
    inputElement.value = value
    inputElement.dispatchEvent(new Event("input", { bubbles: true }))
    inputElement.dispatchEvent(new Event("change", { bubbles: true }))
  })
}

const expandAgentRow = async (view: ReturnType<typeof renderAgentsPanel>, displayName: string) => {
  const row = view.getByRole("row", { name: `${displayName} agent` })
  await clickInAct(
    within(row).getByRole("button", { name: `Expand ${displayName} launch settings` }),
  )
  return view.getByRole("row", { name: `${displayName} launch settings` })
}

describe("AgentsPanel", () => {
  beforeEach(() => {
    globalThis.fetch = mock((input: RequestInfo | URL, init?: RequestInit) => {
      const url = requestUrl(input)
      const method = init?.method ?? "GET"

      if (url === "/v1/status") {
        return Promise.resolve(
          new Response(JSON.stringify(validStatus), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          }),
        )
      }

      if (url === "/v1/settings/agents" && method === "GET") {
        return Promise.resolve(
          new Response(JSON.stringify(agentsCollection(cursorAgent())), {
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
  })

  test("enables cursor with auto-detected path", async () => {
    const detectedPath = "/usr/local/bin/agent"
    const cursorState = { agent: cursorAgent() }

    globalThis.fetch = mock((input: RequestInfo | URL, init?: RequestInit) => {
      const url = requestUrl(input)
      const method = init?.method ?? "GET"

      if (url === "/v1/status") {
        return Promise.resolve(
          new Response(JSON.stringify(validStatus), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          }),
        )
      }

      if (url === "/v1/settings/agents" && method === "GET") {
        return Promise.resolve(
          new Response(JSON.stringify(agentsCollection(cursorState.agent)), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          }),
        )
      }

      if (url === "/v1/settings/agents/cursor" && method === "PATCH") {
        cursorState.agent = cursorAgent({ enabled: true, path: detectedPath, args: ["acp"] })

        return Promise.resolve(
          new Response(JSON.stringify(AgentSettingsSchema.parse(cursorState.agent)), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          }),
        )
      }

      return Promise.resolve(new Response("not found", { status: 404 }))
    }) as typeof fetch

    const view = renderAgentsPanel()

    await waitFor(() => {
      expect(view.getByLabelText("Enable Cursor")).toBeInTheDocument()
    })

    await clickInAct(view.getByLabelText("Enable Cursor"))

    await waitFor(() => {
      const row = view.getByRole("row", { name: "Cursor agent" })
      expect(within(row).getByLabelText("Cursor launch summary")).toHaveTextContent(detectedPath)
      expect(within(row).getByLabelText("Cursor launch summary")).toHaveTextContent("acp")
      expect(within(row).getByLabelText("Enable Cursor")).toBeChecked()
    })
  }, mutationFlowTimeoutMs)

  test("keeps cursor enabled and shows path error when auto-detect fails", async () => {
    const cursorState = { agent: cursorAgent() }

    globalThis.fetch = mock((input: RequestInfo | URL, init?: RequestInit) => {
      const url = requestUrl(input)
      const method = init?.method ?? "GET"

      if (url === "/v1/status") {
        return Promise.resolve(
          new Response(JSON.stringify(validStatus), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          }),
        )
      }

      if (url === "/v1/settings/agents" && method === "GET") {
        return Promise.resolve(
          new Response(JSON.stringify(agentsCollection(cursorState.agent)), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          }),
        )
      }

      if (url === "/v1/settings/agents/cursor" && method === "PATCH") {
        cursorState.agent = cursorAgent({ enabled: true, path: null })

        return Promise.resolve(
          new Response(JSON.stringify(autoDetectFailedProblem), {
            status: 400,
            headers: { "Content-Type": "application/problem+json" },
          }),
        )
      }

      return Promise.resolve(new Response("not found", { status: 404 }))
    }) as typeof fetch

    const view = renderAgentsPanel()

    await waitFor(() => {
      expect(view.getByLabelText("Enable Cursor")).toBeInTheDocument()
    })

    await clickInAct(view.getByLabelText("Enable Cursor"))

    await waitFor(() => {
      const row = view.getByRole("row", { name: "Cursor agent" })
      const settings = view.getByRole("row", { name: "Cursor launch settings" })
      expect(within(settings).getByText("Could not detect agent path automatically.")).toBeInTheDocument()
      expect(within(row).getByLabelText("Enable Cursor")).toBeChecked()
      expect(within(settings).getByLabelText("Cursor executable path")).toBeInTheDocument()
      expect(within(settings).queryByRole("button", { name: "Save Cursor launch settings" })).toBeNull()
    })
  }, mutationFlowTimeoutMs)

  test("shows Save when dirty and PATCHes path with args", async () => {
    const manualPath = "/opt/custom/agent"
    const cursorState = {
      agent: cursorAgent({ enabled: true, path: "/usr/local/bin/agent", args: ["acp"] }),
    }

    const fetchMock = mock((input: RequestInfo | URL, init?: RequestInit) => {
      const url = requestUrl(input)
      const method = init?.method ?? "GET"

      if (url === "/v1/status") {
        return Promise.resolve(
          new Response(JSON.stringify(validStatus), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          }),
        )
      }

      if (url === "/v1/settings/agents" && method === "GET") {
        return Promise.resolve(
          new Response(JSON.stringify(agentsCollection(cursorState.agent)), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          }),
        )
      }

      if (url === "/v1/settings/agents/cursor" && method === "PATCH") {
        const body = JSON.parse(requestBodyText(init?.body))

        if (body.path === manualPath) {
          cursorState.agent = cursorAgent({
            enabled: body.enabled,
            path: manualPath,
            args: body.args,
          })

          return Promise.resolve(
            new Response(JSON.stringify(AgentSettingsSchema.parse(cursorState.agent)), {
              status: 200,
              headers: { "Content-Type": "application/json" },
            }),
          )
        }
      }

      return Promise.resolve(new Response("not found", { status: 404 }))
    })
    globalThis.fetch = fetchMock as typeof fetch

    const view = renderAgentsPanel()

    await waitFor(() => {
      expect(within(view.getByRole("row", { name: "Cursor agent" })).getByLabelText("Enable Cursor")).toBeChecked()
    })

    const settings = await expandAgentRow(view, "Cursor")
    expect(within(settings).queryByRole("button", { name: "Save Cursor launch settings" })).toBeNull()

    const pathInput = within(settings).getByLabelText("Cursor executable path")
    await setInputValue(pathInput, manualPath)
    await setInputValue(within(settings).getByLabelText("Cursor args item 1"), "claude")

    await waitFor(() => {
      expect(within(settings).getByRole("button", { name: "Save Cursor launch settings" })).not.toBeDisabled()
      expect(within(settings).getByRole("button", { name: "Reset Cursor launch settings" })).toBeInTheDocument()
    })

    await clickInAct(within(settings).getByRole("button", { name: "Save Cursor launch settings" }))

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/v1/settings/agents/cursor",
        expect.objectContaining({
          method: "PATCH",
          body: JSON.stringify({
            enabled: true,
            path: manualPath,
            args: ["claude"],
          }),
        }),
      )
      expect(within(settings).queryByRole("button", { name: "Save Cursor launch settings" })).toBeNull()
    })
  }, mutationFlowTimeoutMs)

  test("expanded row shows path and args editors", async () => {
    const cursorState = {
      agent: cursorAgent({
        enabled: true,
        path: "/usr/local/bin/agent",
        args: ["acp"],
      }),
    }

    globalThis.fetch = mock((input: RequestInfo | URL, init?: RequestInit) => {
      const url = requestUrl(input)
      const method = init?.method ?? "GET"

      if (url === "/v1/status") {
        return Promise.resolve(
          new Response(JSON.stringify(validStatus), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          }),
        )
      }

      if (url === "/v1/settings/agents" && method === "GET") {
        return Promise.resolve(
          new Response(JSON.stringify(agentsCollection(cursorState.agent)), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          }),
        )
      }

      return Promise.resolve(new Response("not found", { status: 404 }))
    }) as typeof fetch

    const view = renderAgentsPanel()

    await waitFor(() => {
      expect(view.getByRole("row", { name: "Cursor agent" })).toBeInTheDocument()
    })

    const row = view.getByRole("row", { name: "Cursor agent" })
    expect(within(row).getByLabelText("Cursor launch summary")).toHaveTextContent(
      "/usr/local/bin/agent",
    )
    expect(within(row).getByLabelText("Cursor launch summary")).toHaveTextContent("acp")
    expect(view.queryByLabelText("Cursor executable path")).not.toBeInTheDocument()

    const settings = await expandAgentRow(view, "Cursor")

    expect(within(settings).getByLabelText("Cursor executable path")).toHaveValue(
      "/usr/local/bin/agent",
    )
    expect(within(settings).getByLabelText("Cursor args item 1")).toHaveValue("acp")
    expect(within(settings).queryByRole("button", { name: "Save Cursor launch settings" })).toBeNull()
  })

  test("saves args while preserving enabled state", async () => {
    const cursorState = {
      agent: cursorAgent({
        enabled: false,
        path: "/usr/local/bin/agent",
        args: ["acp"],
      }),
    }

    const fetchMock = mock((input: RequestInfo | URL, init?: RequestInit) => {
      const url = requestUrl(input)
      const method = init?.method ?? "GET"

      if (url === "/v1/status") {
        return Promise.resolve(
          new Response(JSON.stringify(validStatus), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          }),
        )
      }

      if (url === "/v1/settings/agents" && method === "GET") {
        return Promise.resolve(
          new Response(JSON.stringify(agentsCollection(cursorState.agent)), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          }),
        )
      }

      if (url === "/v1/settings/agents/cursor" && method === "PATCH") {
        const body = JSON.parse(requestBodyText(init?.body))

        if (Array.isArray(body.args)) {
          cursorState.agent = cursorAgent({
            enabled: body.enabled,
            path: body.path ?? "/usr/local/bin/agent",
            args: body.args,
          })

          return Promise.resolve(
            new Response(JSON.stringify(AgentSettingsSchema.parse(cursorState.agent)), {
              status: 200,
              headers: { "Content-Type": "application/json" },
            }),
          )
        }
      }

      return Promise.resolve(new Response("not found", { status: 404 }))
    })
    globalThis.fetch = fetchMock as typeof fetch

    const view = renderAgentsPanel()

    await waitFor(() => {
      expect(view.getByRole("row", { name: "Cursor agent" })).toBeInTheDocument()
    })

    const settings = await expandAgentRow(view, "Cursor")
    await setInputValue(within(settings).getByLabelText("Cursor args item 1"), "claude")

    await waitFor(() => {
      expect(within(settings).getByRole("button", { name: "Save Cursor launch settings" })).not.toBeDisabled()
    })

    await clickInAct(within(settings).getByRole("button", { name: "Save Cursor launch settings" }))

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/v1/settings/agents/cursor",
        expect.objectContaining({
          method: "PATCH",
          body: JSON.stringify({
            enabled: false,
            path: "/usr/local/bin/agent",
            args: ["claude"],
          }),
        }),
      )
    })
  }, mutationFlowTimeoutMs)

  test("detect path link pre-fills the input without saving", async () => {
    const detectedPath = "/usr/local/bin/agent"
    const cursorState = { agent: cursorAgent({ enabled: true, path: null, args: [] }) }

    const fetchMock = mock((input: RequestInfo | URL, init?: RequestInit) => {
      const url = requestUrl(input)
      const method = init?.method ?? "GET"

      if (url === "/v1/status") {
        return Promise.resolve(
          new Response(JSON.stringify(validStatus), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          }),
        )
      }

      if (url === "/v1/settings/agents" && method === "GET") {
        return Promise.resolve(
          new Response(JSON.stringify(agentsCollection(cursorState.agent)), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          }),
        )
      }

      if (url === "/v1/settings/agents/cursor/detect-path" && method === "POST") {
        return Promise.resolve(
          new Response(JSON.stringify({ path: detectedPath }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          }),
        )
      }

      return Promise.resolve(new Response("not found", { status: 404 }))
    })
    globalThis.fetch = fetchMock as typeof fetch

    const view = renderAgentsPanel()

    await waitFor(() => {
      expect(view.getByRole("row", { name: "Cursor agent" })).toBeInTheDocument()
    })

    const settings = await expandAgentRow(view, "Cursor")
    await clickInAct(within(settings).getByRole("button", { name: "Detect path" }))

    await waitFor(() => {
      expect(within(settings).getByDisplayValue(detectedPath)).toBeInTheDocument()
    })

    await flushDetectSuccessFeedback(settings)

    expect(
      fetchMock.mock.calls.some(
        ([url, init]) =>
          requestUrl(url) === "/v1/settings/agents/cursor" && init?.method === "PATCH",
      ),
    ).toBe(false)
  })

  test("detect path clears save path error and pre-fills input", async () => {
    const invalidPath = "/does/not/exist"
    const detectedPath = "/usr/local/bin/agent"
    const cursorState = { agent: cursorAgent({ enabled: true, path: null, args: [] }) }

    const invalidPathProblem = {
      type: PROBLEM_TYPES.validationError,
      title: "Invalid agent executable path",
      status: 400,
      code: "validation.field.path.invalid",
      errors: [{ pointer: "#/path", code: "validation.field.path.invalid" }],
    }

    const fetchMock = mock((input: RequestInfo | URL, init?: RequestInit) => {
      const url = requestUrl(input)
      const method = init?.method ?? "GET"

      if (url === "/v1/status") {
        return Promise.resolve(
          new Response(JSON.stringify(validStatus), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          }),
        )
      }

      if (url === "/v1/settings/agents" && method === "GET") {
        return Promise.resolve(
          new Response(JSON.stringify(agentsCollection(cursorState.agent)), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          }),
        )
      }

      if (url === "/v1/settings/agents/cursor" && method === "PATCH") {
        const body = JSON.parse(requestBodyText(init?.body))

        if (body.path === invalidPath) {
          return Promise.resolve(
            new Response(JSON.stringify(invalidPathProblem), {
              status: 400,
              headers: { "Content-Type": "application/problem+json" },
            }),
          )
        }
      }

      if (url === "/v1/settings/agents/cursor/detect-path" && method === "POST") {
        return Promise.resolve(
          new Response(JSON.stringify({ path: detectedPath }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          }),
        )
      }

      return Promise.resolve(new Response("not found", { status: 404 }))
    })
    globalThis.fetch = fetchMock as typeof fetch

    const view = renderAgentsPanel()

    await waitFor(() => {
      expect(view.getByRole("row", { name: "Cursor agent" })).toBeInTheDocument()
    })

    const settings = await expandAgentRow(view, "Cursor")
    const pathInput = within(settings).getByLabelText("Cursor executable path")
    await setInputValue(pathInput, invalidPath)

    await waitFor(() => {
      expect(within(settings).getByRole("button", { name: "Save Cursor launch settings" })).not.toBeDisabled()
    })

    await clickInAct(within(settings).getByRole("button", { name: "Save Cursor launch settings" }))

    await waitFor(() => {
      expect(within(settings).getByText("Invalid agent executable path")).toBeInTheDocument()
    })

    await clickInAct(within(settings).getByRole("button", { name: "Detect path" }))

    await waitFor(() => {
      expect(within(settings).getByDisplayValue(detectedPath)).toBeInTheDocument()
      expect(within(settings).queryByText("Invalid agent executable path")).not.toBeInTheDocument()
    })

    await flushDetectSuccessFeedback(settings)
  }, mutationFlowTimeoutMs)

  test("unavailable agent row is greyed out and cannot be enabled", async () => {
    const view = renderAgentsPanel()

    await waitFor(() => {
      expect(view.getByRole("row", { name: "Claude Agent agent" })).toBeInTheDocument()
    })

    const claudeRow = view.getByRole("row", { name: "Claude Agent agent" })

    expect(within(claudeRow).getByText("Coming soon")).toBeInTheDocument()
    expect(within(claudeRow).queryByLabelText("Enable Claude Agent")).not.toBeInTheDocument()

    const settings = await expandAgentRow(view, "Claude Agent")
    expect(within(settings).getByRole("button", { name: "Detect path" })).toBeDisabled()
    expect(within(settings).getByLabelText("Claude Agent executable path")).toBeDisabled()
    expect(within(settings).queryByRole("button", { name: "Save Claude Agent launch settings" })).toBeNull()
  })

  test("warns when editable npx args omit -y and Add -y dirties Save", async () => {
    const claudeAcp = AgentSettingsSchema.parse({
      id: "claude-acp",
      displayName: "Claude Agent",
      available: true,
      enabled: true,
      path: "npx",
      args: ["@agentclientprotocol/claude-agent-acp@0.66.0"],
      present: true,
      popular: true,
    })

    globalThis.fetch = mock((input: RequestInfo | URL, init?: RequestInit) => {
      const url = requestUrl(input)
      const method = init?.method ?? "GET"

      if (url === "/v1/status") {
        return Promise.resolve(
          new Response(JSON.stringify(validStatus), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          }),
        )
      }

      if (url === "/v1/settings/agents" && method === "GET") {
        return Promise.resolve(
          new Response(
            JSON.stringify(
              AgentSettingsCollectionSchema.parse({
                items: [cursorAgent(), claudeAcp],
              }),
            ),
            {
              status: 200,
              headers: { "Content-Type": "application/json" },
            },
          ),
        )
      }

      return Promise.resolve(new Response("not found", { status: 404 }))
    }) as typeof fetch

    const view = renderAgentsPanel()

    await waitFor(() => {
      expect(view.getByRole("row", { name: "Claude Agent agent" })).toBeInTheDocument()
    })

    const settings = await expandAgentRow(view, "Claude Agent")

    expect(
      within(settings).getByText(/Agents without -y may run in interactive mode and block spawning/i),
    ).toBeInTheDocument()
    expect(within(settings).getByLabelText("Claude Agent command preview")).toHaveTextContent(
      "npx @agentclientprotocol/claude-agent-acp@0.66.0",
    )
    expect(within(settings).queryByRole("button", { name: "Save Claude Agent launch settings" })).toBeNull()

    await clickInAct(within(settings).getByRole("button", { name: "Add -y" }))

    await waitFor(() => {
      expect(
        within(settings).queryByText(/Agents without -y may run in interactive mode and block spawning/i),
      ).toBeNull()
      expect(
        within(settings).getByRole("button", { name: "Save Claude Agent launch settings" }),
      ).not.toBeDisabled()
    })

    expect(within(settings).getByDisplayValue("-y")).toBeInTheDocument()
    expect(within(settings).getByLabelText("Claude Agent command preview")).toHaveTextContent(
      "npx -y @agentclientprotocol/claude-agent-acp@0.66.0",
    )
  })

  test("search filters agents by display name", async () => {
    const view = renderAgentsPanel()

    await waitFor(() => {
      expect(view.getByRole("table", { name: "Agents" })).toBeInTheDocument()
      expect(view.getByRole("row", { name: "Cursor agent" })).toBeInTheDocument()
      expect(view.getByRole("row", { name: "Claude Agent agent" })).toBeInTheDocument()
    })

    await setInputValue(view.getByRole("searchbox", { name: "Search agents" }), "claude")

    await waitFor(() => {
      expect(view.queryByRole("row", { name: "Cursor agent" })).toBeNull()
      expect(view.getByRole("row", { name: "Claude Agent agent" })).toBeInTheDocument()
    })
  })

  test("load more reveals additional agents ten at a time", async () => {
    const manyAgents = Array.from({ length: 12 }, (_, index) => {
      const n = index + 1
      return AgentSettingsSchema.parse({
        id: `agent-${n}`,
        displayName: `Agent ${String(n).padStart(2, "0")}`,
        available: true,
        enabled: false,
        path: null,
        args: [],
        present: false,
        popular: false,
      })
    })

    globalThis.fetch = mock((input: RequestInfo | URL, init?: RequestInit) => {
      const url = requestUrl(input)
      const method = init?.method ?? "GET"

      if (url === "/v1/status") {
        return Promise.resolve(
          new Response(JSON.stringify(validStatus), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          }),
        )
      }

      if (url === "/v1/settings/agents" && method === "GET") {
        return Promise.resolve(
          new Response(JSON.stringify(AgentSettingsCollectionSchema.parse({ items: manyAgents })), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          }),
        )
      }

      return Promise.resolve(new Response("not found", { status: 404 }))
    }) as typeof fetch

    const view = renderAgentsPanel()

    await waitFor(() => {
      expect(view.getByRole("row", { name: "Agent 01 agent" })).toBeInTheDocument()
      expect(view.getByRole("row", { name: "Agent 10 agent" })).toBeInTheDocument()
    })

    expect(view.queryByRole("row", { name: "Agent 11 agent" })).toBeNull()
    expect(view.getByRole("button", { name: "Load more agents, 2 remaining" })).toBeInTheDocument()

    await clickInAct(view.getByRole("button", { name: "Load more agents, 2 remaining" }))

    await waitFor(() => {
      expect(view.getByRole("row", { name: "Agent 11 agent" })).toBeInTheDocument()
      expect(view.getByRole("row", { name: "Agent 12 agent" })).toBeInTheDocument()
      expect(view.queryByRole("button", { name: /Load more agents/ })).toBeNull()
    })
  })

  test("shows error when agent settings API is unreachable", async () => {
    globalThis.fetch = mock((input: RequestInfo | URL) => {
      const url = requestUrl(input)

      if (url === "/v1/status") {
        return Promise.resolve(
          new Response(JSON.stringify(validStatus), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          }),
        )
      }

      if (url === "/v1/settings/agents") {
        return Promise.reject(new Error("network error"))
      }

      return Promise.resolve(new Response("not found", { status: 404 }))
    }) as typeof fetch

    const view = renderAgentsPanel()

    await waitFor(() => {
      expect(view.getByText("Could not load agent settings.")).toBeInTheDocument()
    })
  })

  test("import detect then apply enables selected agents after confirm", async () => {
    const cursorState = { agent: cursorAgent() }
    const importCandidate = {
      id: "brand-new-agent",
      displayName: "Brand New",
      present: true,
      path: "/usr/bin/brand-new",
      inCatalog: false,
      alreadyEnabled: false,
      spawn: {
        kind: "binary" as const,
        binaryName: "brand-new",
        command: ["brand-new", "acp"],
        displayName: "Brand New",
        authMethodId: "brand-new-agent",
      },
    }

    const fetchMock = mock((input: RequestInfo | URL, init?: RequestInit) => {
      const url = requestUrl(input)
      const method = init?.method ?? "GET"

      if (url === "/v1/status") {
        return Promise.resolve(
          new Response(JSON.stringify(validStatus), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          }),
        )
      }

      if (url === "/v1/settings/agents" && method === "GET") {
        return Promise.resolve(
          new Response(JSON.stringify(agentsCollection(cursorState.agent)), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          }),
        )
      }

      if (url === "/v1/settings/agents/import/detect" && method === "POST") {
        return Promise.resolve(
          new Response(JSON.stringify({ items: [importCandidate] }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          }),
        )
      }

      if (url === "/v1/settings/agents/import/apply" && method === "POST") {
        const body = JSON.parse(requestBodyText(init?.body))
        expect(body.agents).toEqual([
          {
            id: "brand-new-agent",
            path: "/usr/bin/brand-new",
            spawn: importCandidate.spawn,
          },
        ])

        cursorState.agent = cursorAgent({ enabled: true, path: "/usr/local/bin/agent" })
        const imported = {
          id: "brand-new-agent",
          displayName: "Brand New",
          available: true,
          enabled: true,
          path: "/usr/bin/brand-new",
          args: [],
          present: true,
          popular: false,
        }

        return Promise.resolve(
          new Response(
            JSON.stringify(
              AgentSettingsCollectionSchema.parse({
                items: [imported, cursorState.agent, comingSoonAgent],
              }),
            ),
            {
              status: 200,
              headers: { "Content-Type": "application/json" },
            },
          ),
        )
      }

      return Promise.resolve(new Response("not found", { status: 404 }))
    })
    globalThis.fetch = fetchMock as typeof fetch

    const view = renderAgentsPanel()

    await waitFor(() => {
      expect(view.getByRole("button", { name: "Import" })).toBeInTheDocument()
    })

    await clickInAct(view.getByRole("button", { name: "Import" }))

    await waitFor(() => {
      expect(view.getByRole("dialog", { name: "Import agents" })).toBeInTheDocument()
      expect(view.getByLabelText("Enable Brand New")).toBeChecked()
    })

    await clickInAct(view.getByRole("button", { name: "Enable selected" }))

    await waitFor(() => {
      expect(view.queryByRole("dialog", { name: "Import agents" })).not.toBeInTheDocument()
      expect(view.getByRole("row", { name: "Brand New agent" })).toBeInTheDocument()
    })
  }, mutationFlowTimeoutMs)
})
