import { describe, expect, test } from "bun:test"
import { knownCapabilityPaths } from "./capabilities"
import { buildCapabilityInventory, inventoryEntry } from "./inventory"
import { agentMethodDeclarations } from "./method.declarations"

describe("buildCapabilityInventory", () => {
  test("maps a known payload with known and requiredBy", () => {
    const inventory = buildCapabilityInventory({
      initializeResult: {
        agentInfo: { name: "cursor", version: "1.0.0", title: "Cursor" },
        agentCapabilities: {
          loadSession: true,
          sessionCapabilities: {
            list: true,
            close: {},
          },
          promptCapabilities: {
            image: true,
          },
        },
      },
      declarations: agentMethodDeclarations,
    })

    expect(inventory.agentInfo).toEqual({
      name: "cursor",
      version: "1.0.0",
      title: "Cursor",
    })

    expect(inventoryEntry(inventory, "loadSession")).toEqual({
      path: "loadSession",
      advertised: true,
      value: true,
      known: true,
      requiredBy: ["session/load"],
    })
    expect(inventoryEntry(inventory, "sessionCapabilities.close")).toEqual({
      path: "sessionCapabilities.close",
      advertised: true,
      value: {},
      known: true,
      requiredBy: ["session/close"],
    })
    expect(inventoryEntry(inventory, "promptCapabilities.image")).toEqual({
      path: "promptCapabilities.image",
      advertised: true,
      value: true,
      known: true,
      requiredBy: [],
    })
    expect(inventory.entries.filter((entry) => entry.known).map((entry) => entry.path)).toEqual([
      ...knownCapabilityPaths,
    ])
  })

  test("nested _meta children land as unknown", () => {
    const inventory = buildCapabilityInventory({
      initializeResult: {
        agentCapabilities: {
          loadSession: true,
          sessionCapabilities: {
            close: {
              _meta: { "vendor.quirk": 1 },
            },
          },
          _meta: { topLevel: true },
        },
      },
      declarations: agentMethodDeclarations,
    })

    expect(inventoryEntry(inventory, "sessionCapabilities.close")).toEqual({
      path: "sessionCapabilities.close",
      advertised: true,
      value: { _meta: { "vendor.quirk": 1 } },
      known: true,
      requiredBy: ["session/close"],
    })
    expect(inventoryEntry(inventory, "sessionCapabilities.close._meta.vendor.quirk")).toEqual({
      path: "sessionCapabilities.close._meta.vendor.quirk",
      advertised: true,
      value: 1,
      known: false,
      requiredBy: [],
    })
    expect(inventoryEntry(inventory, "_meta.topLevel")).toEqual({
      path: "_meta.topLevel",
      advertised: true,
      value: true,
      known: false,
      requiredBy: [],
    })
    expect(inventoryEntry(inventory, "_meta")).toBeUndefined()
    expect(inventoryEntry(inventory, "sessionCapabilities")).toBeUndefined()
  })

  test("a recognized path the agent omitted keeps requiredBy", () => {
    const inventory = buildCapabilityInventory({
      initializeResult: {
        agentCapabilities: {
          loadSession: true,
        },
      },
      declarations: agentMethodDeclarations,
    })

    expect(inventoryEntry(inventory, "sessionCapabilities.list")).toEqual({
      path: "sessionCapabilities.list",
      advertised: false,
      known: true,
      requiredBy: ["session/list"],
    })
    expect(
      Object.prototype.hasOwnProperty.call(
        inventoryEntry(inventory, "sessionCapabilities.list") ?? {},
        "value",
      ),
    ).toBe(false)
  })

  test("a recognized path no method requires has empty requiredBy", () => {
    const inventory = buildCapabilityInventory({
      initializeResult: {
        agentCapabilities: {},
      },
      declarations: agentMethodDeclarations,
    })

    expect(inventoryEntry(inventory, "promptCapabilities.audio")).toEqual({
      path: "promptCapabilities.audio",
      advertised: false,
      known: true,
      requiredBy: [],
    })
  })

  test("a known path with nested children still gets an entry at that path", () => {
    const inventory = buildCapabilityInventory({
      initializeResult: {
        agentCapabilities: {
          sessionCapabilities: {
            close: { reason: true },
          },
        },
      },
      declarations: agentMethodDeclarations,
    })

    expect(inventoryEntry(inventory, "sessionCapabilities.close")).toEqual({
      path: "sessionCapabilities.close",
      advertised: true,
      value: { reason: true },
      known: true,
      requiredBy: ["session/close"],
    })
    expect(inventoryEntry(inventory, "sessionCapabilities.close.reason")).toEqual({
      path: "sessionCapabilities.close.reason",
      advertised: true,
      value: true,
      known: false,
      requiredBy: [],
    })
  })
})
