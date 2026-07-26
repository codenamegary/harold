import { z } from "zod"

export const WorkspacePageCursorPayloadSchema = z.strictObject({
  id: z.string().min(1),
  edge: z.enum(["after", "before"]),
})

export type WorkspacePageCursorPayload = z.infer<typeof WorkspacePageCursorPayloadSchema>

export const encodeWorkspacePageCursor = (payload: WorkspacePageCursorPayload): string =>
  Buffer.from(JSON.stringify(payload)).toString("base64url")

export const decodeWorkspacePageCursor = (
  cursor: string,
): { ok: true; value: WorkspacePageCursorPayload } | { ok: false } => {
  try {
    const json = Buffer.from(cursor, "base64url").toString("utf8")
    const value = WorkspacePageCursorPayloadSchema.parse(JSON.parse(json))
    return { ok: true, value }
  } catch {
    return { ok: false }
  }
}
