import { ConflictProblemSchema, PROBLEM_TYPES, ValidationProblemSchema } from "contracts/http/error"
import { FilesystemPathError } from "core/filesystem/errors"

const rootPathErrorCodes: Record<FilesystemPathError["kind"], string> = {
  missing: "validation.field.root.missing",
  not_directory: "validation.field.root.not_directory",
  unreadable: "validation.field.root.unreadable",
}

const parentPathErrorCodes: Record<FilesystemPathError["kind"], string> = {
  missing: "validation.field.parent.missing",
  not_directory: "validation.field.parent.not_directory",
  unreadable: "validation.field.parent.unreadable",
}

const buildValidationProblem = (pointer: string, code: string) =>
  ValidationProblemSchema.parse({
    type: PROBLEM_TYPES.validationError,
    title: "Request validation failed",
    status: 400,
    code: "validation.request.invalid",
    errors: [{ pointer, code }],
  })

export const buildRootPathValidationProblem = (error: FilesystemPathError) =>
  buildValidationProblem("#/root", rootPathErrorCodes[error.kind])

export const buildParentPathValidationProblem = (error: FilesystemPathError) =>
  buildValidationProblem("#/parent", parentPathErrorCodes[error.kind])

export const buildParentNotWritableProblem = () =>
  buildValidationProblem("#/parent", "validation.field.parent.not_writable")

export const buildInvalidDirectoryNameProblem = () =>
  buildValidationProblem("#/name", "validation.field.name.invalid")

export const buildDirectoryAlreadyExistsProblem = () =>
  ConflictProblemSchema.parse({
    type: PROBLEM_TYPES.conflict,
    title: "Directory already exists",
    status: 409,
    detail: "A directory with that name already exists in the parent folder",
  })
