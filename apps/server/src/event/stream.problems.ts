import {
  NotFoundProblemSchema,
  PROBLEM_TYPES,
  ValidationProblemSchema,
} from "contracts/http/error"

export const buildEventStreamInvalidCursorProblem = () =>
  ValidationProblemSchema.parse({
    type: PROBLEM_TYPES.validationError,
    title: "Request validation failed",
    status: 400,
    code: "validation.request.invalid",
    errors: [{ pointer: "#/cursor", code: "validation.query.cursor.invalid" }],
  })

export const buildEventStreamUnsafeCursorProblem = () =>
  ValidationProblemSchema.parse({
    type: PROBLEM_TYPES.validationError,
    title: "Request validation failed",
    status: 400,
    code: "validation.request.invalid",
    errors: [{ pointer: "#/cursor", code: "validation.query.cursor.unsafe" }],
  })

export const buildEventStreamFutureCursorProblem = () =>
  ValidationProblemSchema.parse({
    type: PROBLEM_TYPES.validationError,
    title: "Request validation failed",
    status: 400,
    code: "validation.request.invalid",
    errors: [{ pointer: "#/cursor", code: "validation.query.cursor.future" }],
  })

export const buildEventStreamWorkspaceNotFoundProblem = () =>
  NotFoundProblemSchema.parse({
    type: PROBLEM_TYPES.notFound,
    title: "Workspace not found",
    status: 404,
    detail: "Unknown workspace id",
  })

export const buildEventStreamSessionNotFoundProblem = () =>
  NotFoundProblemSchema.parse({
    type: PROBLEM_TYPES.notFound,
    title: "Session not found",
    status: 404,
    detail: "Unknown session id",
  })
