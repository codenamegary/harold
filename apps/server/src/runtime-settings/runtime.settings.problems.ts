import {
  AllowedRootHasWorkspacesProblemSchema,
  PROBLEM_TYPES,
  ValidationProblemSchema,
} from "contracts/http/error"
import { FilesystemPathError } from "../filesystem/filesystem.errors"

const pathErrorCodes: Record<FilesystemPathError["kind"], string> = {
  missing: "validation.field.allowedRoots.missing",
  not_directory: "validation.field.allowedRoots.not_directory",
  unreadable: "validation.field.allowedRoots.unreadable",
}

export const buildAllowedRootValidationProblem = (params: {
  error: FilesystemPathError
  index: number
}) =>
  ValidationProblemSchema.parse({
    type: PROBLEM_TYPES.validationError,
    title: "Request validation failed",
    status: 400,
    code: "validation.request.invalid",
    errors: [
      {
        pointer: `#/allowedRoots/${params.index}`,
        code: pathErrorCodes[params.error.kind],
      },
    ],
  })

export const buildAllowedRootHasWorkspacesProblem = (
  detail = "Allowed root has registered workspaces",
) =>
  AllowedRootHasWorkspacesProblemSchema.parse({
    type: PROBLEM_TYPES.allowedRootHasWorkspaces,
    title: "Allowed root has registered workspaces",
    status: 409,
    detail,
    forceDeleteAvailable: true,
  })
