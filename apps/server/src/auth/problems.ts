import {
  PROBLEM_TYPES,
  UnauthorizedProblem,
  UnauthorizedProblemSchema,
} from "contracts/http/error"

export const BEARER_CHALLENGE = "Bearer"

export const buildUnauthorizedProblem = (): UnauthorizedProblem =>
  UnauthorizedProblemSchema.parse({
    type: PROBLEM_TYPES.unauthorized,
    title: "Unauthorized",
    status: 401,
    detail: "Authentication required",
  })
