import { describe, expect, test } from "bun:test"
import { buildCapabilityInventory } from "../acp/agent/inventory"
import { agentMethodDeclarations } from "../acp/agent/method.declarations"
import { wireAgentCapabilities } from "./capabilities.wire"

const declarations = agentMethodDeclarations

describe("wireAgentCapabilities", () => {
  test("returns null for stopped, starting, and error runtime states", () => {
    const inventory = buildCapabilityInventory({
      initializeResult: {
        agentCapabilities: { loadSession: true },
        agentInfo: { name: "fake", version: "1" },
      },
      declarations,
    })

    expect(
      wireAgentCapabilities({ status: "stopped", error: null }, inventory),
    ).toBeNull()
    expect(
      wireAgentCapabilities({ status: "starting", error: null }, inventory),
    ).toBeNull()
    expect(
      wireAgentCapabilities({ status: "error", error: "spawn failed" }, inventory),
    ).toBeNull()
  })

  test("returns null when inventory is missing on a ready runtime", () => {
    expect(
      wireAgentCapabilities({ status: "ready", error: null }, null),
    ).toBeNull()
  })

  test("omits value when advertised is false and includes it when true", () => {
    const inventory = buildCapabilityInventory({
      initializeResult: {
        agentCapabilities: {
          loadSession: true,
          sessionCapabilities: { list: {} },
        },
        agentInfo: { name: "fake-acp", version: "0.0.0" },
      },
      declarations,
    })

    const wired = wireAgentCapabilities({ status: "ready", error: null }, inventory)

    expect(wired).not.toBeNull()
    const loadSession = wired?.entries.find((entry) => entry.path === "loadSession")
    const sessionList = wired?.entries.find(
      (entry) => entry.path === "sessionCapabilities.list",
    )
    const sessionClose = wired?.entries.find(
      (entry) => entry.path === "sessionCapabilities.close",
    )

    expect(loadSession).toEqual({
      path: "loadSession",
      advertised: true,
      value: true,
      known: true,
      requiredBy: ["session/load"],
    })
    expect(sessionList).toEqual({
      path: "sessionCapabilities.list",
      advertised: true,
      value: {},
      known: true,
      requiredBy: ["session/list"],
    })
    expect(sessionClose).toMatchObject({
      path: "sessionCapabilities.close",
      advertised: false,
      known: true,
      requiredBy: ["session/close"],
    })
    expect(sessionClose).not.toHaveProperty("value")
  })
})
