import {
  PayloadTooLargeProblemSchema,
  UnsupportedMediaTypeProblemSchema,
} from "contracts/http/error"

export { buildWorkspaceNotFoundProblem } from "../session/session.problems"

export const buildAttachmentNotFoundProblem = (detail = "Unknown attachment") => ({
  type: "https://agent-server.local/problems/not-found",
  title: "Attachment not found",
  status: 404,
  detail,
})

export const buildAttachmentTooLargeProblem = (detail: string) =>
  PayloadTooLargeProblemSchema.parse({
    type: "https://agent-server.local/problems/payload-too-large",
    title: "Attachment too large",
    status: 413,
    detail,
  })

export const buildAttachmentTypeRejectedProblem = (detail: string) =>
  UnsupportedMediaTypeProblemSchema.parse({
    type: "https://agent-server.local/problems/unsupported-media-type",
    title: "Attachment type rejected",
    status: 415,
    detail,
  })
