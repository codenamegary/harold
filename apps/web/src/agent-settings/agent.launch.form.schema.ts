import { z } from "zod"

export const AgentLaunchFormSchema = z.object({
  path: z.string().min(1),
  args: z.array(z.string()),
})

export type AgentLaunchFormValues = z.infer<typeof AgentLaunchFormSchema>
