import { createHash } from "node:crypto"

export const hashToolCallIdForLog = (toolCallId: string): string =>
  createHash("sha256").update(toolCallId).digest("hex").slice(0, 12)
