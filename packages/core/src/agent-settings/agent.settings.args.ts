import { z } from "zod"

const argsSchema = z.array(z.string())

/**
 * Parse persisted args JSON.
 * `null` means unset (callers should apply template defaults).
 */
export const parseArgs = (raw: string | null): string[] | null => {
  if (raw === null) {
    return null
  }

  return argsSchema.parse(JSON.parse(raw))
}

export const serializeArgs = (args: readonly string[]): string => JSON.stringify([...args])
