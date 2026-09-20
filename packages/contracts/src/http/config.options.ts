import { z } from "zod"
import { AgentIdSchema } from "./agent-settings"

export const ConfigOptionValueSchema = z.strictObject({
  value: z.string(),
  name: z.string(),
  description: z.string().nullish(),
  _meta: z.unknown().nullish(),
})

const OptionIdentityFields = {
  id: z.string().min(1),
  name: z.string().min(1),
  description: z.string().nullish(),
  category: z.string().min(1).nullish(),
  _meta: z.unknown().nullish(),
}

export const SelectOptionSchema = z.strictObject({
  ...OptionIdentityFields,
  type: z.literal("select"),
  currentValue: z.string(),
  options: z.array(ConfigOptionValueSchema),
})

export const BooleanOptionSchema = z.strictObject({
  ...OptionIdentityFields,
  type: z.literal("boolean"),
  currentValue: z.boolean(),
})

export const ConfigOptionSchema = z.discriminatedUnion("type", [
  SelectOptionSchema,
  BooleanOptionSchema,
])

export const SessionConfigSchema = z.array(ConfigOptionSchema)

export type ConfigOptionValue = z.infer<typeof ConfigOptionValueSchema>
export type SelectOption = z.infer<typeof SelectOptionSchema>
export type BooleanOption = z.infer<typeof BooleanOptionSchema>
export type ConfigOption = z.infer<typeof ConfigOptionSchema>
export type SessionConfig = z.infer<typeof SessionConfigSchema>

export type ConfigCategory = "model" | "mode" | "model_config" | "thought_level" | "other"

const RESERVED_CATEGORIES: ReadonlyArray<string> = [
  "model",
  "mode",
  "model_config",
  "thought_level",
]

export const categoryOf = (option: ConfigOption): ConfigCategory => {
  const { category } = option
  if (category === undefined || category === null || category.startsWith("_")) {
    return "other"
  }
  return RESERVED_CATEGORIES.includes(category) ? (category as ConfigCategory) : "other"
}

export const isModelOption = (option: ConfigOption): boolean => categoryOf(option) === "model"

export const SET_CONFIG_OPTIONS_PATH = "/v1/sessions/:sessionId/config-options/:configId"

export const setConfigOptionPath = (sessionId: string, configId: string) =>
  `/v1/sessions/${encodeURIComponent(sessionId)}/config-options/${encodeURIComponent(configId)}`

export const SetConfigOptionBodySchema = z.strictObject({
  value: z.union([z.string(), z.boolean()]),
})

export type SetConfigOptionBody = z.infer<typeof SetConfigOptionBodySchema>

export const SetConfigOptionParamsSchema = z.strictObject({
  sessionId: z.string().min(1),
  configId: z.string().min(1),
})

export type SetConfigOptionParams = z.infer<typeof SetConfigOptionParamsSchema>

export const SetConfigOptionQuerySchema = z.strictObject({
  agentId: AgentIdSchema,
})

export type SetConfigOptionQuery = z.infer<typeof SetConfigOptionQuerySchema>
