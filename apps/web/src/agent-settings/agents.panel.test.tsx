import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test"
import { act, fireEvent, waitFor, within } from "@testing-library/react"
import {
  AgentSettings,
  AgentSettingsCollectionSchema,
  AgentSettingsSchema,
} from "contracts/http/agent-settings"
import { PROBLEM_TYPES } from "contracts/http/error"
import { renderWithProviders } from "../query/render.with.providers"
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

const claudeAgent: AgentSettings = {
  id: "claude",
  displayName: "Claude",
  available: false,
  enabled: false,
  path: null,
}

const cursorAgent = (overrides: Partial<AgentSettings> = {}): AgentSettings => ({
  id: "cursor",
  displayName: "Cursor",
  available: true,
  enabled: false,
  path: null,
  ...overrides,
})

const agentsCollection = (cursor: AgentSettings) =>
  AgentSettingsCollectionSchema.parse({
    items: [cursor, claudeAgent],
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

const flushDetectSuccessFeedback = async (card: HTMLElement) => {
  const checkmark = card.querySelector(".animate-detect-path-check")

  if (!checkmark) {
    return
  }

  await act(async () => {
    fireEvent.animationEnd(checkmark)
  })
}

const setInputValue = async (input: HTMLElement, value: string) => {
  const inputElement = input as HTMLInputElement
  const valueSetter = Object.getOwnPropertyDescriptor(
    HTMLInputElement.prototype,
    "value",
  )?.set

  await act(async () => {
    if (valueSetter) {
      valueSetter.call(inputElement, value)
    }

    inputElement.dispatchEvent(new Event("input", { bubbles: true }))
    inputElement.dispatchEvent(new Event("change", { bubbles: true }))
  })
}

describe("AgentsPanel", () => {
  beforeEach(() => {
    globalThis.fetch = mock((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
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
      const url = String(input)
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
        cursorState.agent = cursorAgent({ enabled: true, path: detectedPath })

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
      const card = view.getByLabelText("Cursor agent")
      expect(within(card).getByDisplayValue(detectedPath)).toBeInTheDocument()
      expect(within(card).getByLabelText("Enable Cursor")).toBeChecked()
    })
  }, mutationFlowTimeoutMs)

  test("keeps cursor enabled and shows path error when auto-detect fails", async () => {
    const cursorState = { agent: cursorAgent() }

    globalThis.fetch = mock((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
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
      const card = view.getByLabelText("Cursor agent")
      expect(within(card).getByText("Could not detect agent path automatically.")).toBeInTheDocument()
      expect(within(card).getByLabelText("Enable Cursor")).toBeChecked()
      expect(within(card).getByRole("button", { name: "Save path" })).toBeInTheDocument()
    })
  }, mutationFlowTimeoutMs)

  test("saves a manual path override", async () => {
    const manualPath = "/opt/custom/agent"
    const cursorState = { agent: cursorAgent({ enabled: true, path: null }) }

    const fetchMock = mock((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
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
        const body = JSON.parse(String(init?.body))

        if (body.path === manualPath) {
          cursorState.agent = cursorAgent({ enabled: true, path: manualPath })

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
      expect(within(view.getByLabelText("Cursor agent")).getByLabelText("Enable Cursor")).toBeChecked()
    })

    const card = view.getByLabelText("Cursor agent")
    const pathInput = within(card).getByLabelText("Executable path")
    await setInputValue(pathInput, manualPath)

    await waitFor(() => {
      expect(within(card).getByRole("button", { name: "Save path" })).not.toBeDisabled()
    })

    await clickInAct(within(card).getByRole("button", { name: "Save path" }))

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/v1/settings/agents/cursor",
        expect.objectContaining({
          method: "PATCH",
          body: JSON.stringify({ enabled: true, path: manualPath }),
        }),
      )
      expect(within(card).getByRole("button", { name: "Save path" })).toBeDisabled()
    })
  }, mutationFlowTimeoutMs)

  test("detect path link pre-fills the input without saving", async () => {
    const detectedPath = "/usr/local/bin/agent"
    const cursorState = { agent: cursorAgent({ enabled: true, path: null }) }

    const fetchMock = mock((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
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
      expect(view.getByLabelText("Cursor agent")).toBeInTheDocument()
    })

    const card = view.getByLabelText("Cursor agent")
    await clickInAct(within(card).getByRole("button", { name: "Detect path" }))

    await waitFor(() => {
      expect(within(card).getByDisplayValue(detectedPath)).toBeInTheDocument()
    })

    await flushDetectSuccessFeedback(card)

    expect(
      fetchMock.mock.calls.some(
        ([url, init]) =>
          String(url) === "/v1/settings/agents/cursor" && init?.method === "PATCH",
      ),
    ).toBe(false)
  })

  test("detect path clears save path error and pre-fills input", async () => {
    const invalidPath = "/does/not/exist"
    const detectedPath = "/usr/local/bin/agent"
    const cursorState = { agent: cursorAgent({ enabled: true, path: null }) }

    const invalidPathProblem = {
      type: PROBLEM_TYPES.validationError,
      title: "Invalid agent executable path",
      status: 400,
      code: "validation.field.path.invalid",
      errors: [{ pointer: "#/path", code: "validation.field.path.invalid" }],
    }

    const fetchMock = mock((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
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
        const body = JSON.parse(String(init?.body))

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
      expect(view.getByLabelText("Cursor agent")).toBeInTheDocument()
    })

    const card = view.getByLabelText("Cursor agent")
    const pathInput = within(card).getByLabelText("Executable path")
    await setInputValue(pathInput, invalidPath)

    await waitFor(() => {
      expect(within(card).getByRole("button", { name: "Save path" })).not.toBeDisabled()
    })

    await clickInAct(within(card).getByRole("button", { name: "Save path" }))

    await waitFor(() => {
      expect(within(card).getByText("Invalid agent executable path")).toBeInTheDocument()
    })

    await clickInAct(within(card).getByRole("button", { name: "Detect path" }))

    await waitFor(() => {
      expect(within(card).getByDisplayValue(detectedPath)).toBeInTheDocument()
      expect(within(card).queryByText("Invalid agent executable path")).not.toBeInTheDocument()
    })

    await flushDetectSuccessFeedback(card)
  }, mutationFlowTimeoutMs)

  test("claude card is greyed out and cannot be enabled", async () => {
    const view = renderAgentsPanel()

    await waitFor(() => {
      expect(view.getByLabelText("Claude agent")).toBeInTheDocument()
    })

    const claudeCard = view.getByLabelText("Claude agent")

    expect(within(claudeCard).getByText("Coming soon")).toBeInTheDocument()
    expect(within(claudeCard).queryByLabelText("Enable Claude")).not.toBeInTheDocument()
    expect(within(claudeCard).getByRole("button", { name: "Detect path" })).toBeDisabled()
    expect(within(claudeCard).getByRole("button", { name: "Save path" })).toBeDisabled()
  })

  test("shows error when agent settings API is unreachable", async () => {
    globalThis.fetch = mock((input: RequestInfo | URL) => {
      const url = String(input)

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
})
