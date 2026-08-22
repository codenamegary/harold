import { describe, expect, test } from "bun:test"
import { buildCapabilityInventory } from "../acp/agent/inventory"
import { agentMethodDeclarations } from "../acp/agent/method.declarations"
import {
  agentAdvertisesResumable,
  agentAdvertisesSessionClose,
  agentAdvertisesSessionList,
} from "./session.acp.ready"

const inventoryFrom = (agentCapabilities: unknown) =>
  buildCapabilityInventory({
    initializeResult: { agentCapabilities },
    declarations: agentMethodDeclarations,
  })

describe("capability gate helpers", () => {
  test("resumable requires loadSession value true", () => {
    const supervisor = {
      getCapabilityInventory: () =>
        inventoryFrom({ loadSession: true, sessionCapabilities: { list: true } }),
    }

    expect(agentAdvertisesResumable(supervisor, "cursor")).toBe(true)
    expect(
      agentAdvertisesResumable(
        {
          getCapabilityInventory: () => inventoryFrom({ loadSession: false }),
        },
        "cursor",
      ),
    ).toBe(false)
  })

  test("session close allows empty object and rejects false", () => {
    expect(
      agentAdvertisesSessionClose(
        {
          getCapabilityInventory: () =>
            inventoryFrom({ sessionCapabilities: { close: {} } }),
        },
        "cursor",
      ),
    ).toBe(true)
    expect(
      agentAdvertisesSessionClose(
        {
          getCapabilityInventory: () =>
            inventoryFrom({ sessionCapabilities: { close: false } }),
        },
        "cursor",
      ),
    ).toBe(false)
  })

  test("session list treats any advertised value as supported including false", () => {
    expect(
      agentAdvertisesSessionList(
        {
          getCapabilityInventory: () =>
            inventoryFrom({ sessionCapabilities: { list: false } }),
        },
        "cursor",
      ),
    ).toBe(true)
    expect(
      agentAdvertisesSessionList(
        {
          getCapabilityInventory: () => inventoryFrom({ loadSession: true }),
        },
        "cursor",
      ),
    ).toBe(false)
  })
})
