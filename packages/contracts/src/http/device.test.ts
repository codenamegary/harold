import { describe, expect, test } from "bun:test"
import {
  DEVICES_PATH,
  devicePath,
  DeviceCollectionSchema,
  DeviceCredentialResponseSchema,
  DeviceSchema,
  ListDevicesQuerySchema,
} from "./device"

const validDevice = {
  id: "device_01JFC8C7E77NQCFH0RF9Z22JHH",
  name: "Pixel 8",
  platform: "android",
  state: "online",
  pairedAt: "2026-07-24T12:00:00.000Z",
  lastSeenAt: "2026-07-24T12:05:00.000Z",
} as const

describe("DEVICES_PATH", () => {
  test("is the public devices resource", () => {
    expect(DEVICES_PATH).toBe("/v1/devices")
  })
})

describe("devicePath", () => {
  test("builds the device resource path", () => {
    expect(devicePath("device_01JFC8C7E77NQCFH0RF9Z22JHH")).toBe(
      "/v1/devices/device_01JFC8C7E77NQCFH0RF9Z22JHH",
    )
  })
})

describe("DeviceSchema", () => {
  test("accepts a valid device", () => {
    expect(DeviceSchema.parse(validDevice)).toEqual(validDevice)
  })

  test("accepts null platform and lastSeenAt", () => {
    const device = {
      ...validDevice,
      platform: null,
      lastSeenAt: null,
      state: "offline",
    }

    expect(DeviceSchema.parse(device)).toEqual(device)
  })

  test("accepts revoked state", () => {
    expect(DeviceSchema.parse({ ...validDevice, state: "revoked" }).state).toBe(
      "revoked",
    )
  })

  test("rejects empty name", () => {
    expect(() => DeviceSchema.parse({ ...validDevice, name: "" })).toThrow()
  })

  test("rejects name over 80 characters", () => {
    expect(() =>
      DeviceSchema.parse({ ...validDevice, name: "a".repeat(81) }),
    ).toThrow()
  })

  test("rejects invalid state", () => {
    expect(() =>
      DeviceSchema.parse({ ...validDevice, state: "paired" }),
    ).toThrow()
  })

  test("rejects prototype fingerprint", () => {
    expect(() =>
      DeviceSchema.parse({
        ...validDevice,
        fingerprint: "SHA256:6F:48:90:AC:17:32:9D:04",
      }),
    ).toThrow()
  })

  test("rejects credential fields on the public device resource", () => {
    expect(() =>
      DeviceSchema.parse({
        ...validDevice,
        credential: "secret-credential",
      }),
    ).toThrow()

    expect(() =>
      DeviceSchema.parse({
        ...validDevice,
        credentialHash: "abc123",
      }),
    ).toThrow()
  })
})

describe("ListDevicesQuerySchema", () => {
  test("defaults limit to 100", () => {
    expect(ListDevicesQuerySchema.parse({})).toEqual({ limit: 100 })
  })

  test("accepts state filter and cursor", () => {
    expect(
      ListDevicesQuerySchema.parse({
        state: "online",
        cursor: "device_02",
        limit: "20",
      }),
    ).toEqual({
      state: "online",
      cursor: "device_02",
      limit: 20,
    })
  })

  test("rejects limit above 200", () => {
    expect(() => ListDevicesQuerySchema.parse({ limit: 201 })).toThrow()
  })
})

describe("DeviceCollectionSchema", () => {
  test("accepts a device collection", () => {
    const collection = {
      items: [validDevice],
      page: { limit: 20, nextCursor: "device_02", count: 1 },
    }

    expect(DeviceCollectionSchema.parse(collection)).toEqual(collection)
  })

  test("rejects prototype hasMore on page", () => {
    expect(() =>
      DeviceCollectionSchema.parse({
        items: [validDevice],
        page: { limit: 20, hasMore: true },
      }),
    ).toThrow()
  })
})

describe("DeviceCredentialResponseSchema", () => {
  test("accepts device plus one-time credential", () => {
    const response = {
      device: validDevice,
      credential: "devcred_opaque_high_entropy_secret_value",
    }

    expect(DeviceCredentialResponseSchema.parse(response)).toEqual(response)
  })

  test("rejects empty credential", () => {
    expect(() =>
      DeviceCredentialResponseSchema.parse({
        device: validDevice,
        credential: "",
      }),
    ).toThrow()
  })

  test("rejects response without credential", () => {
    expect(() =>
      DeviceCredentialResponseSchema.parse({ device: validDevice }),
    ).toThrow()
  })

  test("rejects extra fields", () => {
    expect(() =>
      DeviceCredentialResponseSchema.parse({
        device: validDevice,
        credential: "devcred_opaque_high_entropy_secret_value",
        refreshToken: "nope",
      }),
    ).toThrow()
  })
})
