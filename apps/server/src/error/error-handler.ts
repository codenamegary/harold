import {
  InternalProblemSchema,
  PROBLEM_TYPES,
  ValidationProblemSchema,
} from "contracts/http/error"
import { FastifyInstance } from "fastify"
import { ZodError } from "zod"
import { zodIssueToCode, zodPathToPointer } from "./zod-problem"

const buildValidationProblem = (error: ZodError) =>
  ValidationProblemSchema.parse({
    type: PROBLEM_TYPES.validationError,
    title: "Request validation failed",
    status: 400,
    code: "validation.request.invalid",
    errors: error.issues.map((issue) => ({
      pointer: zodPathToPointer(issue.path),
      code: zodIssueToCode(issue),
    })),
  })

const buildInternalProblem = (error: Error) =>
  InternalProblemSchema.parse({
    type: PROBLEM_TYPES.internalError,
    title: "Internal server error",
    status: 500,
    detail: error.message,
  })

export const registerErrorHandler = (app: FastifyInstance) => {
  app.setErrorHandler((error, _request, reply) => {
    if (error instanceof ZodError) {
      const problem = buildValidationProblem(error)
      return reply
        .status(400)
        .type("application/problem+json")
        .send(problem)
    }

    const problem = buildInternalProblem(
      error instanceof Error ? error : new Error("Unknown error"),
    )

    return reply.status(500).type("application/problem+json").send(problem)
  })
}
