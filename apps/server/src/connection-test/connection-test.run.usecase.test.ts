import { describe, expect, test } from "bun:test"
import { Device } from "contracts/http/device"
import { makeRunConnectionTest, RunConnectionTestDeps } from "./connection-test.run.usecase"

const aDevice = (): Device => ({
  id: "dev_probe",
  name: "Connection test probe",
  platform: null,
  state: "offline",
  pairedAt: "2026-01-01T00:00:00.000Z",
  lastSeenAt: null,
})

const never = (name: string) => () => {
  throw new Error(`${name} should not be called`)
}

const baseDeps = (overrides: Partial<RunConnectionTestDeps> = {}): RunConnectionTestDeps => ({
  getAdvertisedUrl: () => "https://agents.example.com",
  deviceProvisioning: {
    createProbeDevice: () => ({
      ok: true,
      value: { device: aDevice(), credential: "devcred_probe" },
    }),
    revokeDevice: () => ({ ok: true, value: { newlyRevoked: true } }),
  },
  lookupHost: async () => [{ address: "127.0.0.1", family: 4 }],
  connectTcp: async () => undefined,
  verifyTls: async () => ({ id: "tls", status: "pass", message: "TLS ok" }),
  fetchDeviceAuth: async () => ({
    id: "device-auth",
    status: "pass",
    message: "Auth ok",
  }),
  ...overrides,
})

describe("run connection test use case", () => {
  test("returns missing_advertised_url without probing", async () => {
    const runConnectionTest = makeRunConnectionTest(
      baseDeps({
        getAdvertisedUrl: () => null,
        deviceProvisioning: {
          createProbeDevice: never("createProbeDevice"),
          revokeDevice: never("revokeDevice"),
        },
        lookupHost: never("lookupHost"),
        connectTcp: never("connectTcp"),
        verifyTls: never("verifyTls"),
        fetchDeviceAuth: never("fetchDeviceAuth"),
      }),
    )

    expect(await runConnectionTest()).toEqual({
      ok: false,
      error: { kind: "missing_advertised_url" },
    })
  })

  test("runs dns, tls, and auth in order and revokes the probe device", async () => {
    const order: string[] = []
    const revokedDeviceIds: string[] = []

    const runConnectionTest = makeRunConnectionTest(
      baseDeps({
        lookupHost: async () => {
          order.push("lookupHost")
          return [{ address: "127.0.0.1", family: 4 }]
        },
        connectTcp: async () => {
          order.push("connectTcp")
        },
        verifyTls: async () => {
          order.push("verifyTls")
          return { id: "tls", status: "pass", message: "TLS ok" }
        },
        deviceProvisioning: {
          createProbeDevice: () => {
            order.push("createProbeDevice")
            return {
              ok: true,
              value: { device: aDevice(), credential: "devcred_probe" },
            }
          },
          revokeDevice: (command) => {
            order.push("revokeDevice")
            revokedDeviceIds.push(command.deviceId)
            return { ok: true, value: { newlyRevoked: true } }
          },
        },
        fetchDeviceAuth: async () => {
          order.push("fetchDeviceAuth")
          return { id: "device-auth", status: "pass", message: "Auth ok" }
        },
      }),
    )

    const result = await runConnectionTest()

    expect(order).toEqual([
      "lookupHost",
      "connectTcp",
      "verifyTls",
      "createProbeDevice",
      "fetchDeviceAuth",
      "revokeDevice",
    ])
    expect(revokedDeviceIds).toEqual(["dev_probe"])
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.advertisedUrl).toBe("https://agents.example.com")
    expect(result.value.checks.map((check) => check.id)).toEqual(["dns", "tls", "device-auth"])
    expect(result.value.canContinue).toBe(true)
    expect(result.value.canContinueAnyway).toBe(false)
  })

  test("skips tls and auth when dns fails", async () => {
    const runConnectionTest = makeRunConnectionTest(
      baseDeps({
        lookupHost: async () => {
          throw new Error("ENOTFOUND agents.example.com")
        },
        verifyTls: never("verifyTls"),
        fetchDeviceAuth: never("fetchDeviceAuth"),
        deviceProvisioning: {
          createProbeDevice: never("createProbeDevice"),
          revokeDevice: never("revokeDevice"),
        },
      }),
    )

    const result = await runConnectionTest()

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.checks).toEqual([
      {
        id: "dns",
        status: "fail",
        message: "ENOTFOUND agents.example.com",
      },
      {
        id: "tls",
        status: "fail",
        message: "Skipped because DNS and reachability failed",
      },
      {
        id: "device-auth",
        status: "fail",
        message: "Skipped because earlier checks failed",
      },
    ])
    expect(result.value.canContinue).toBe(false)
    expect(result.value.canContinueAnyway).toBe(false)
  })

  test("returns probe_device_failed when probe provisioning fails", async () => {
    const runConnectionTest = makeRunConnectionTest(
      baseDeps({
        deviceProvisioning: {
          createProbeDevice: () => ({
            ok: false,
            error: { kind: "device_not_found" as const },
          }),
          revokeDevice: never("revokeDevice"),
        },
        fetchDeviceAuth: never("fetchDeviceAuth"),
      }),
    )

    expect(await runConnectionTest()).toEqual({
      ok: false,
      error: { kind: "probe_device_failed" },
    })
  })

  test("continues with self-signed tls and sends the probe credential to the devices path", async () => {
    let authParams: { url: string; credential: string; allowSelfSignedTls: boolean } | undefined

    const runConnectionTest = makeRunConnectionTest(
      baseDeps({
        verifyTls: async () => ({
          id: "tls",
          status: "warn",
          message: "Certificate is self-signed",
        }),
        fetchDeviceAuth: async (params) => {
          authParams = params
          return { id: "device-auth", status: "pass", message: "Auth ok" }
        },
      }),
    )

    const result = await runConnectionTest()

    expect(authParams).toEqual({
      url: "https://agents.example.com/v1/devices",
      credential: "devcred_probe",
      allowSelfSignedTls: true,
    })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.canContinue).toBe(false)
    expect(result.value.canContinueAnyway).toBe(true)
  })

  test("revokes the probe device when the auth check rejects", async () => {
    let revoked = false

    const runConnectionTest = makeRunConnectionTest(
      baseDeps({
        fetchDeviceAuth: async () => {
          throw new Error("auth exploded")
        },
        deviceProvisioning: {
          createProbeDevice: () => ({
            ok: true,
            value: { device: aDevice(), credential: "devcred_probe" },
          }),
          revokeDevice: () => {
            revoked = true
            return { ok: true, value: { newlyRevoked: true } }
          },
        },
      }),
    )

    let rejection: unknown
    await runConnectionTest().catch((caught: unknown) => {
      rejection = caught
    })
    expect(rejection).toBeInstanceOf(Error)
    if (rejection instanceof Error) {
      expect(rejection.message).toBe("auth exploded")
    }
    expect(revoked).toBe(true)
  })
})
