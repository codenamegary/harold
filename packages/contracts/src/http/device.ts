import { z } from "zod"
import { createCollectionSchema } from "./collection"
import { CursorSchema, IdSchema, TimestampSchema } from "./primitives"

export const DEVICES_PATH = "/v1/devices" as const

export const devicePath = (deviceId: string) => `${DEVICES_PATH}/${deviceId}`

export const deleteDevicePath = (deviceId: string, query: { hardDelete?: boolean } = {}) => {
  const path = devicePath(deviceId)
  if (query.hardDelete !== true) {
    return path
  }
  return `${path}?hardDelete=true`
}

export const DeviceStateSchema = z.enum(["online", "offline", "revoked"])

export const DeviceSchema = z.strictObject({
  id: IdSchema,
  name: z.string().min(1).max(80),
  platform: z.string().min(1).max(64).nullable(),
  state: DeviceStateSchema,
  pairedAt: TimestampSchema,
  lastSeenAt: TimestampSchema.nullable(),
})

export const DeviceCollectionSchema = createCollectionSchema(DeviceSchema)

export const ListDevicesQuerySchema = z.strictObject({
  limit: z.coerce.number().int().positive().max(200).default(100),
  cursor: CursorSchema.optional(),
  state: DeviceStateSchema.optional(),
})

export const DeleteDeviceQuerySchema = z.strictObject({
  hardDelete: z
    .enum(["true", "false"])
    .optional()
    .transform((value) => value === "true"),
})

export const DeviceCredentialResponseSchema = z.strictObject({
  device: DeviceSchema,
  credential: z.string().min(1),
})

export type Device = z.infer<typeof DeviceSchema>
export type DeviceState = z.infer<typeof DeviceStateSchema>
export type DeviceCollection = z.infer<typeof DeviceCollectionSchema>
export type ListDevicesQuery = z.infer<typeof ListDevicesQuerySchema>
export type DeleteDeviceQuery = z.infer<typeof DeleteDeviceQuerySchema>
export type DeviceCredentialResponse = z.infer<typeof DeviceCredentialResponseSchema>
