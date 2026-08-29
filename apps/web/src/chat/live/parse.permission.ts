import { z } from "zod"

export type StreamPermissionOption = {
  optionId: string
  name: string
}

export type StreamPermission = {
  requestId: string
  toolName: string
  options: ReadonlyArray<StreamPermissionOption>
}

const PermissionOptionSchema = z
  .object({
    optionId: z.string().min(1),
    name: z.string().min(1),
  })
  .passthrough()

const PermissionParamsSchema = z
  .object({
    options: z.array(PermissionOptionSchema).min(1),
    toolCall: z.object({ name: z.string().min(1) }).passthrough().optional(),
    toolName: z.string().min(1).optional(),
  })
  .passthrough()

export const parseStreamPermission = (params: {
  requestId: string
  params: unknown
}): StreamPermission | null => {
  const parsed = PermissionParamsSchema.safeParse(params.params)
  if (!parsed.success) {
    return null
  }

  return {
    requestId: params.requestId,
    toolName: parsed.data.toolCall?.name ?? parsed.data.toolName ?? "tool",
    options: parsed.data.options.map((option) => ({
      optionId: option.optionId,
      name: option.name,
    })),
  }
}
