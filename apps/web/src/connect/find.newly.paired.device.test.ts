import { describe, expect, test } from "bun:test"
import { Device } from "contracts/http/device"
import { findNewlyPairedDevice } from "./find.newly.paired.device"

const device = (overrides: Partial<Device> & Pick<Device, "id" | "name" | "pairedAt">): Device => ({
  platform: "Android",
  state: "offline",
  lastSeenAt: null,
  ...overrides,
})

describe("findNewlyPairedDevice", () => {
  test("returns undefined when every device was already known", () => {
    const known = device({
      id: "dev_old",
      name: "Old phone",
      pairedAt: "2026-08-02T20:00:00.000Z",
    })

    expect(
      findNewlyPairedDevice({
        baselineIds: new Set(["dev_old"]),
        devices: [known],
      }),
    ).toBeUndefined()
  })

  test("returns the newest device that was not in the baseline", () => {
    const first = device({
      id: "dev_a",
      name: "First",
      pairedAt: "2026-08-02T21:00:00.000Z",
    })
    const second = device({
      id: "dev_b",
      name: "Field phone",
      pairedAt: "2026-08-02T21:02:00.000Z",
      state: "online",
    })

    expect(
      findNewlyPairedDevice({
        baselineIds: new Set(["dev_old"]),
        devices: [first, second],
      }),
    ).toEqual(second)
  })

  test("ignores revoked newcomers", () => {
    expect(
      findNewlyPairedDevice({
        baselineIds: new Set(),
        devices: [
          device({
            id: "dev_revoked",
            name: "Gone",
            pairedAt: "2026-08-02T21:02:00.000Z",
            state: "revoked",
          }),
        ],
      }),
    ).toBeUndefined()
  })
})
