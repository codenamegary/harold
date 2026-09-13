import { AgentIdSchema } from "contracts/http/agent-settings"
import { z } from "zod"

export const SetConfigOptionQuerySchema = z.strictObject({
  agentId: AgentIdSchema,
})
