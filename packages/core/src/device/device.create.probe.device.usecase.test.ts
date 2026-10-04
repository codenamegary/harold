import { describe, expect, test } from "bun:test"
import { Device } from "contracts/http/device"
import { makeCreateProbeDevice } from "./device.create.probe.device.usecase"

const aDevice = (overrides: Partial<Device> = {}): Device => ({
  id: "dev_probe",
  name: "Connection test probe",
  platform: null,
  state: "offline",
  pairedAt: "2026-01-01T00:00:00.000Z",
  lastSeenAt: null,
  ...overrides,
})

describe("create probe device use case", () => {
  test("inserts a probe device and returns its credential", () => {
    let insertInput:
      | {
          name: string
          platform: string | null
          credentialHash: string
          pairedAt: string
        }
      | undefined

    const createProbeDevice = makeCreateProbeDevice({
      insertProbeDevice: (input) => {
        insertInput = input
        return { ok: true, value: aDevice({ name: input.name }) }
      },
    })

    const result = createProbeDevice()

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.device.name).toBe("Connection test probe")
    expect(result.value.credential.startsWith("devcred_")).toBe(true)
    expect(insertInput?.name).toBe("Connection test probe")
    expect(insertInput?.platform).toBeNull()
    expect(insertInput?.credentialHash.length).toBeGreaterThan(0)
  })

  test("propagates an insert failure", () => {
    const createProbeDevice = makeCreateProbeDevice({
      insertProbeDevice: () => ({
        ok: false,
        error: { kind: "pairing_code_not_found" as const },
      }),
    })

    const result = createProbeDevice()

    expect(result).toEqual({
      ok: false,
      error: { kind: "pairing_code_not_found" },
    })
  })
})
