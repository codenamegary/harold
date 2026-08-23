import { describe, expect, test } from "bun:test"
import { renderWithProviders } from "../../query/render.with.providers"
import { AgentAuthBadge } from "./AgentAuthBadge"

describe("AgentAuthBadge", () => {
  test("shows needs auth label", () => {
    const { getByLabelText } = renderWithProviders(
      <AgentAuthBadge
        agentName="Claude"
        summary={{
          status: "needs_auth",
          error: null,
          activeSessionId: null,
          canLogout: true,
        }}
      />,
    )

    expect(getByLabelText("Claude auth status").textContent).toBe("needs auth")
  })

  test("shows signed in label", () => {
    const { getByLabelText } = renderWithProviders(
      <AgentAuthBadge
        agentName="Claude"
        summary={{
          status: "authenticated",
          error: null,
          activeSessionId: null,
          canLogout: true,
        }}
      />,
    )

    expect(getByLabelText("Claude auth status").textContent).toBe("signed in")
  })
})
