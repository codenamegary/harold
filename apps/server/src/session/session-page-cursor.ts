import { z } from "zod"

export const SessionPageCursorPayloadSchema = z.strictObject({
  id: z.string().min(1),
  edge: z.enum(["after", "before"]),
})

export type SessionPageCursorPayload = z.infer<typeof SessionPageCursorPayloadSchema>

export const encodeSessionPageCursor = (payload: SessionPageCursorPayload): string =>
  Buffer.from(JSON.stringify(payload)).toString("base64url")

export const decodeSessionPageCursor = (
  cursor: string,
): { ok: true; value: SessionPageCursorPayload } | { ok: false } => {
  try {
    const json = Buffer.from(cursor, "base64url").toString("utf8")
    const value = SessionPageCursorPayloadSchema.parse(JSON.parse(json))
    return { ok: true, value }
  } catch {
    return { ok: false }
  }
}
