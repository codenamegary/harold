import { describe, expect, test } from "bun:test"
import { render } from "@testing-library/react"
import { StatusSchema } from "contracts/http/status"
import App from "./App"

describe("App", () => {
  test("renders the agent server placeholder", () => {
    const { getByRole, getByText } = render(<App />)

    expect(getByRole("main")).toBeInTheDocument()
    expect(getByText("Agent Server")).toBeInTheDocument()
  })
})

describe("contracts workspace dependency", () => {
  test("StatusSchema parses a valid status payload", () => {
    const status = StatusSchema.parse({
      version: "0.1.0",
      state: "online",
      bindAddress: "127.0.0.1",
      port: 3847,
      startedAt: "2026-01-01T00:00:00.000Z",
      uptimeSeconds: 42,
      acp: {
        state: "ready",
        activeSessions: 0,
      },
    })

    expect(status.port).toBe(3847)
  })
})
