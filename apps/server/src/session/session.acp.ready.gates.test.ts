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
        inventoryFrom({ loadSession: true, sessionCapabilities: { list: {} } }),
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

  test("session close treats empty object as supported and null as unsupported", () => {
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
            inventoryFrom({ sessionCapabilities: { close: null } }),
        },
        "cursor",
      ),
    ).toBe(false)
  })

  test("session list treats empty object as supported, null as unsupported, and false as supported", () => {
    expect(
      agentAdvertisesSessionList(
        {
          getCapabilityInventory: () =>
            inventoryFrom({ sessionCapabilities: { list: {} } }),
        },
        "cursor",
      ),
    ).toBe(true)
    expect(
      agentAdvertisesSessionList(
        {
          getCapabilityInventory: () =>
            inventoryFrom({ sessionCapabilities: { list: null } }),
        },
        "cursor",
      ),
    ).toBe(false)
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
