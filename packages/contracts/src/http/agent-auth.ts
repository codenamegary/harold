import { z } from "zod"
import { AgentIdSchema } from "./agent.id.generated"

export const AGENTS_PATH = "/v1/agents" as const

export const agentAuthPath = (agentId: string) => `${AGENTS_PATH}/${agentId}/auth`

export const agentAuthSessionsPath = (agentId: string) =>
  `${agentAuthPath(agentId)}/sessions`

export const agentAuthSessionActionsPath = (agentId: string, sessionId: string) =>
  `${agentAuthSessionsPath(agentId)}/${sessionId}/actions`

export const agentAuthLogoutPath = (agentId: string) => `${agentAuthPath(agentId)}/logout`

export const AgentAuthStatusSchema = z.enum([
  "unknown",
  "needs_auth",
  "authenticated",
  "error",
])

export const AgentAuthSummarySchema = z.strictObject({
  status: AgentAuthStatusSchema,
  error: z.string().nullable(),
  activeSessionId: z.string().nullable(),
  canLogout: z.boolean(),
})

export const AuthSessionStatusSchema = z.enum([
  "in_progress",
  "succeeded",
  "failed",
  "cancelled",
])

export const AuthShowMessageStepSchema = z.strictObject({
  type: z.literal("show_message"),
  level: z.enum(["info", "error"]),
  body: z.string(),
})

export const AuthConfirmStepSchema = z.strictObject({
  type: z.literal("confirm"),
  stepId: z.string().min(1),
  title: z.string(),
  body: z.string(),
  confirmLabel: z.string(),
})

export const AuthWorkingStepSchema = z.strictObject({
  type: z.literal("working"),
  label: z.string(),
})

export const AuthDoneStepSchema = z.strictObject({
  type: z.literal("done"),
  outcome: z.enum(["succeeded", "failed", "cancelled"]),
  message: z.string().nullable(),
})

export const AuthStepV1Schema = z.discriminatedUnion("type", [
  AuthShowMessageStepSchema,
  AuthConfirmStepSchema,
  AuthWorkingStepSchema,
  AuthDoneStepSchema,
])

/** Closed host-login vocabulary. No reserved future steps on the wire. */
export const AuthStepSchema = AuthStepV1Schema

export const AuthConfirmActionSchema = z.strictObject({
  type: z.literal("confirm"),
  stepId: z.string().min(1),
})

export const AuthCancelActionSchema = z.strictObject({
  type: z.literal("cancel"),
})

export const AuthSessionActionSchema = z.discriminatedUnion("type", [
  AuthConfirmActionSchema,
  AuthCancelActionSchema,
])

export const AgentAuthSessionSchema = z.strictObject({
  sessionId: z.string().min(1),
  agentId: AgentIdSchema,
  status: AuthSessionStatusSchema,
  steps: z.array(AuthStepSchema),
  error: z.string().nullable(),
})

export const AgentAuthSchema = z.strictObject({
  agentId: AgentIdSchema,
  status: AgentAuthStatusSchema,
  error: z.string().nullable(),
  session: AgentAuthSessionSchema.nullable(),
})

export const StartAgentAuthSessionBodySchema = z.strictObject({})

export const AgentAuthSessionActionBodySchema = AuthSessionActionSchema

export type AgentAuthStatus = z.infer<typeof AgentAuthStatusSchema>
export type AgentAuthSummary = z.infer<typeof AgentAuthSummarySchema>
export type AuthSessionStatus = z.infer<typeof AuthSessionStatusSchema>
export type AuthStepV1 = z.infer<typeof AuthStepV1Schema>
export type AuthStep = AuthStepV1
export type AuthSessionAction = z.infer<typeof AuthSessionActionSchema>
export type AgentAuthSession = z.infer<typeof AgentAuthSessionSchema>
export type AgentAuth = z.infer<typeof AgentAuthSchema>
