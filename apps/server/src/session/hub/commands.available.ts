import { z } from "zod"

const AvailableCommandInputSchema = z
  .object({
    hint: z.string().optional(),
  })
  .passthrough()

const AvailableCommandSchema = z
  .object({
    name: z.string().min(1),
    description: z.string(),
    input: AvailableCommandInputSchema.optional(),
  })
  .passthrough()

export const AvailableCommandsUpdateSchema = z
  .object({
    sessionUpdate: z.literal("available_commands_update"),
    availableCommands: z.array(AvailableCommandSchema),
  })
  .passthrough()

export type AvailableCommandsUpdate = z.infer<typeof AvailableCommandsUpdateSchema>

export const parseAvailableCommandsUpdate = (
  update: unknown,
): AvailableCommandsUpdate | null => {
  const parsed = AvailableCommandsUpdateSchema.safeParse(update)
  if (!parsed.success) {
    return null
  }
  return parsed.data
}
