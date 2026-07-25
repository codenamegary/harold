import { z } from "zod";

export const PROBLEM_TYPES = {
  validationError: "https://agent-server.local/problems/validation-error",
  internalError: "https://agent-server.local/problems/internal-error",
} as const;

export const ProblemErrorSchema = z.object({
  pointer: z.string().min(1),
  code: z.string().min(1),
});

const InternalProblemFieldsSchema = z.object({
  title: z.string().min(1),
  status: z.number().int().optional(),
  detail: z.string().optional(),
  instance: z.string().optional(),
});

const ValidationProblemFieldsSchema = z.object({
  title: z.string().min(1),
  status: z.number().int().optional(),
  code: z.string().min(1),
  instance: z.string().optional(),
});

export const ValidationProblemSchema = ValidationProblemFieldsSchema.extend({
  type: z.literal(PROBLEM_TYPES.validationError),
  errors: z.array(ProblemErrorSchema).min(1),
}).strict();

export const InternalProblemSchema = InternalProblemFieldsSchema.extend({
  type: z.literal(PROBLEM_TYPES.internalError),
}).strict();

export const ProblemDetailsSchema = z.discriminatedUnion("type", [
  ValidationProblemSchema,
  InternalProblemSchema,
]);

export type ProblemError = z.infer<typeof ProblemErrorSchema>;
export type ValidationProblem = z.infer<typeof ValidationProblemSchema>;
export type InternalProblem = z.infer<typeof InternalProblemSchema>;
export type ProblemDetails = z.infer<typeof ProblemDetailsSchema>;
