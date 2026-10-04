import {
  NotFoundProblemSchema,
  PayloadTooLargeProblemSchema,
  PROBLEM_TYPES,
  UnsupportedMediaTypeProblemSchema,
  ValidationProblemSchema,
} from "contracts/http/error"
import { ZodError } from "zod"
import { zodIssueToCode, zodPathToPointer } from "../error/zod.problem"

export const buildAttachmentParamsProblem = (error: ZodError) =>
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

export const buildWorkspaceNotFoundProblem = (detail = "Unknown workspace id") =>
  NotFoundProblemSchema.parse({
    type: PROBLEM_TYPES.notFound,
    title: "Workspace not found",
    status: 404,
    detail,
  })

export const buildAttachmentNotFoundProblem = (detail = "Unknown attachment") =>
  NotFoundProblemSchema.parse({
    type: PROBLEM_TYPES.notFound,
    title: "Attachment not found",
    status: 404,
    detail,
  })

export const buildAttachmentTooLargeProblem = (detail: string) =>
  PayloadTooLargeProblemSchema.parse({
    type: "https://harold.local/problems/payload-too-large",
    title: "Attachment too large",
    status: 413,
    detail,
  })

export const buildAttachmentTypeRejectedProblem = (detail: string) =>
  UnsupportedMediaTypeProblemSchema.parse({
    type: "https://harold.local/problems/unsupported-media-type",
    title: "Attachment type rejected",
    status: 415,
    detail,
  })
