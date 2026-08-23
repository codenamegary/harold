import {
  ConflictProblemSchema,
  NotFoundProblemSchema,
  PROBLEM_TYPES,
} from "contracts/http/error"
import { AuthBrokerError } from "./broker"

export const buildAgentAuthNotFoundProblem = (detail = "Unknown agent id") =>
  NotFoundProblemSchema.parse({
    type: PROBLEM_TYPES.notFound,
    title: "Agent not found",
    status: 404,
    detail,
  })

export const buildAgentAuthSessionNotFoundProblem = (
  detail = "Auth session not found",
) =>
  NotFoundProblemSchema.parse({
    type: PROBLEM_TYPES.notFound,
    title: "Auth session not found",
    status: 404,
    detail,
  })

export const buildAgentAuthLogoutBlockedProblem = (sessionId: string) =>
  ConflictProblemSchema.parse({
    type: PROBLEM_TYPES.conflict,
    title: "Auth session in progress",
    status: 409,
    detail: `Finish or cancel auth session ${sessionId} before signing out`,
  })

export const buildAgentAuthInvalidActionProblem = (detail: string) =>
  ConflictProblemSchema.parse({
    type: PROBLEM_TYPES.conflict,
    title: "Invalid auth action",
    status: 409,
    detail,
  })

export const problemForAuthBrokerError = (error: AuthBrokerError) => {
  switch (error.kind) {
    case "agent_not_found":
      return { status: 404, problem: buildAgentAuthNotFoundProblem() }
    case "session_not_found":
      return { status: 404, problem: buildAgentAuthSessionNotFoundProblem() }
    case "logout_blocked":
      return {
        status: 409,
        problem: buildAgentAuthLogoutBlockedProblem(error.sessionId),
      }
    case "session_conflict":
      return {
        status: 409,
        problem: buildAgentAuthLogoutBlockedProblem(error.sessionId),
      }
    case "invalid_action":
      return {
        status: 409,
        problem: buildAgentAuthInvalidActionProblem(error.detail),
      }
  }
}
