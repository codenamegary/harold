import { z } from "zod"

export const DevicePageCursorPayloadSchema = z.strictObject({
  id: z.string().min(1),
  edge: z.enum(["after", "before"]),
})

export type DevicePageCursorPayload = z.infer<typeof DevicePageCursorPayloadSchema>

export const encodeDevicePageCursor = (payload: DevicePageCursorPayload): string =>
  Buffer.from(JSON.stringify(payload)).toString("base64url")

export const decodeDevicePageCursor = (
  cursor: string,
): { ok: true; value: DevicePageCursorPayload } | { ok: false } => {
  try {
    const json = Buffer.from(cursor, "base64url").toString("utf8")
    const value = DevicePageCursorPayloadSchema.parse(JSON.parse(json))
    return { ok: true, value }
  } catch {
    return { ok: false }
  }
}
