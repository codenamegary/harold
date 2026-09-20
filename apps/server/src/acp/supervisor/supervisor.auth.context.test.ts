import os from "node:os"
import { describe, expect, test } from "bun:test"
import { buildAdapterAuthContext } from "./supervisor.auth.context"

describe("buildAdapterAuthContext", () => {
  test("builds the context with the default host identity", () => {
    const context = buildAdapterAuthContext("cursor", { agentInfo: { name: "cursor" } })

    expect(context.agentId).toBe("cursor")
    expect(context.hostIdentity).toEqual({ id: "default" })
    expect(context.hostMachineName).toBe(os.hostname())
    expect(context.initializeResult).toEqual({ agentInfo: { name: "cursor" } })
  })

  test("leaves the initialize result undefined when not provided", () => {
    const context = buildAdapterAuthContext("opencode")

    expect(context.agentId).toBe("opencode")
    expect(context.initializeResult).toBeUndefined()
  })
})
