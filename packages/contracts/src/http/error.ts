import { z } from "zod"

export const PROBLEM_TYPES = {
  validationError: "https://harold.local/problems/validation-error",
  internalError: "https://harold.local/problems/internal-error",
  notFound: "https://harold.local/problems/not-found",
  conflict: "https://harold.local/problems/conflict",
  unprocessable: "https://harold.local/problems/unprocessable",
  unauthorized: "https://harold.local/problems/unauthorized",
  forbidden: "https://harold.local/problems/forbidden",
  workspaceActiveSessions: "https://harold.local/problems/workspace-has-active-sessions",
  payloadTooLarge: "https://harold.local/problems/payload-too-large",
  unsupportedMediaType: "https://harold.local/problems/unsupported-media-type",
} as const

export const ProblemErrorSchema = z.strictObject({
  pointer: z.string().min(1),
  code: z.string().min(1),
})

const InternalProblemFieldsSchema = z.strictObject({
  title: z.string().min(1),
  status: z.number().int().optional(),
  detail: z.string().optional(),
  instance: z.string().optional(),
})

const ValidationProblemFieldsSchema = z.strictObject({
  title: z.string().min(1),
  status: z.number().int().optional(),
  code: z.string().min(1),
  instance: z.string().optional(),
})

export const ValidationProblemSchema = z.strictObject({
  ...ValidationProblemFieldsSchema.shape,
  type: z.literal(PROBLEM_TYPES.validationError),
  errors: z.array(ProblemErrorSchema).min(1),
})

export const InternalProblemSchema = z.strictObject({
  ...InternalProblemFieldsSchema.shape,
  type: z.literal(PROBLEM_TYPES.internalError),
})

export const NotFoundProblemSchema = z.strictObject({
  ...InternalProblemFieldsSchema.shape,
  type: z.literal(PROBLEM_TYPES.notFound),
})

export const ConflictProblemSchema = z.strictObject({
  ...InternalProblemFieldsSchema.shape,
  type: z.literal(PROBLEM_TYPES.conflict),
})

export const UnprocessableProblemSchema = z.strictObject({
  ...InternalProblemFieldsSchema.shape,
  type: z.literal(PROBLEM_TYPES.unprocessable),
})

export const UnauthorizedProblemSchema = z.strictObject({
  ...InternalProblemFieldsSchema.shape,
  type: z.literal(PROBLEM_TYPES.unauthorized),
})

export const ForbiddenProblemSchema = z.strictObject({
  ...InternalProblemFieldsSchema.shape,
  type: z.literal(PROBLEM_TYPES.forbidden),
})

export const PayloadTooLargeProblemSchema = z.strictObject({
  ...InternalProblemFieldsSchema.shape,
  type: z.literal(PROBLEM_TYPES.payloadTooLarge),
})

export const UnsupportedMediaTypeProblemSchema = z.strictObject({
  ...InternalProblemFieldsSchema.shape,
  type: z.literal(PROBLEM_TYPES.unsupportedMediaType),
})

export const WorkspaceActiveSessionsProblemSchema = z.strictObject({
  ...InternalProblemFieldsSchema.shape,
  type: z.literal(PROBLEM_TYPES.workspaceActiveSessions),
  forceDeleteAvailable: z.literal(true),
})

export const ProblemDetailsSchema = z.discriminatedUnion("type", [
  ValidationProblemSchema,
  InternalProblemSchema,
  NotFoundProblemSchema,
  ConflictProblemSchema,
  UnprocessableProblemSchema,
  UnauthorizedProblemSchema,
  ForbiddenProblemSchema,
  WorkspaceActiveSessionsProblemSchema,
])

export type ProblemError = z.infer<typeof ProblemErrorSchema>
export type ValidationProblem = z.infer<typeof ValidationProblemSchema>
export type InternalProblem = z.infer<typeof InternalProblemSchema>
export type NotFoundProblem = z.infer<typeof NotFoundProblemSchema>
export type ConflictProblem = z.infer<typeof ConflictProblemSchema>
export type UnprocessableProblem = z.infer<typeof UnprocessableProblemSchema>
export type UnauthorizedProblem = z.infer<typeof UnauthorizedProblemSchema>
export type WorkspaceActiveSessionsProblem = z.infer<typeof WorkspaceActiveSessionsProblemSchema>
export type ProblemDetails = z.infer<typeof ProblemDetailsSchema>
