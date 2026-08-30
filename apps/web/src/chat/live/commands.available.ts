import { z } from "zod"

export type AvailableCommand = {
  name: string
  description: string
  hint?: string
}

const AvailableCommandSchema = z
  .object({
    name: z.string().min(1),
    description: z.string(),
    input: z.object({ hint: z.string() }).passthrough().optional(),
  })
  .passthrough()

const AvailableCommandsUpdateSchema = z
  .object({
    sessionUpdate: z.literal("available_commands_update"),
    availableCommands: z.array(AvailableCommandSchema),
  })
  .passthrough()

/**
 * The gateway fans ACP updates out as opaque JSON. Chat parses the shapes it
 * cares about locally rather than importing the server's ACP schemas.
 */
export const parseAvailableCommands = (
  update: unknown,
): ReadonlyArray<AvailableCommand> | null => {
  const parsed = AvailableCommandsUpdateSchema.safeParse(update)
  if (!parsed.success) {
    return null
  }

  return parsed.data.availableCommands.map((command) => ({
    name: command.name,
    description: command.description,
    ...(command.input?.hint === undefined ? {} : { hint: command.input.hint }),
  }))
}
