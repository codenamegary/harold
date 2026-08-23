import { afterEach, describe, expect, test } from "bun:test"
import { fireEvent, waitFor } from "@testing-library/react"
import { AgentAuth } from "contracts/http/agent-auth"
import { renderWithProviders } from "../../query/render.with.providers"
import { requestUrl } from "../../test/request.url"
import { AgentAuthPanel } from "./AgentAuthPanel"

const originalFetch = globalThis.fetch

const inFlightAuth = (overrides: Partial<AgentAuth> = {}): AgentAuth => ({
  agentId: "claude-acp",
  status: "needs_auth",
  error: null,
  session: {
    sessionId: "sess-1",
    agentId: "claude-acp",
    status: "in_progress",
    steps: [
      {
        type: "show_message",
        level: "info",
        body: "Sign in on the host machine.",
      },
      {
        type: "confirm",
        stepId: "host-login",
        title: "Confirm",
        body: "When finished, continue.",
        confirmLabel: "I have logged in",
      },
    ],
    error: null,
  },
  ...overrides,
})

afterEach(() => {
  globalThis.fetch = originalFetch
})

describe("AgentAuthPanel", () => {
  test("shows Sign in and Sign out when idle", () => {
    const { getByRole } = renderWithProviders(
      <AgentAuthPanel
        agentId="claude-acp"
        agentName="Claude"
        summary={{
          status: "needs_auth",
          error: null,
          activeSessionId: null,
          canLogout: true,
        }}
        auth={null}
      />,
    )

    expect(getByRole("button", { name: "Sign in" })).toBeTruthy()
    expect(getByRole("button", { name: "Sign out" })).toBeTruthy()
  })

  test("disables Sign out while session in flight", () => {
    const { getByRole, getByText } = renderWithProviders(
      <AgentAuthPanel
        agentId="claude-acp"
        agentName="Claude"
        summary={{
          status: "needs_auth",
          error: null,
          activeSessionId: "sess-1",
          canLogout: true,
        }}
        auth={inFlightAuth()}
      />,
    )

    expect(getByText("Sign in on the host machine.")).toBeTruthy()
    expect(getByRole("button", { name: "I have logged in" })).toBeTruthy()
    expect(getByRole("button", { name: "Cancel" })).toBeTruthy()
  })

  test("Cancel posts cancel action", async () => {
    const calls: Array<{ url: string; method: string; body: string }> = []
    globalThis.fetch = async (input, init) => {
      const url = requestUrl(input)
      const method = init?.method ?? "GET"
      const body = typeof init?.body === "string" ? init.body : ""
      calls.push({ url, method, body })
      return new Response(
        JSON.stringify({
          sessionId: "sess-1",
          agentId: "claude-acp",
          status: "cancelled",
          steps: [
            {
              type: "done",
              outcome: "cancelled",
              message: null,
            },
          ],
          error: null,
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      )
    }

    const { getByRole } = renderWithProviders(
      <AgentAuthPanel
        agentId="claude-acp"
        agentName="Claude"
        summary={{
          status: "needs_auth",
          error: null,
          activeSessionId: "sess-1",
          canLogout: true,
        }}
        auth={inFlightAuth()}
      />,
    )

    fireEvent.click(getByRole("button", { name: "Cancel" }))

    await waitFor(() => {
      expect(calls.some((call) => call.method === "POST" && call.body.includes("cancel"))).toBe(
        true,
      )
    })
  })
})
