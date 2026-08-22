import { ZodIssue } from "zod"

export const zodPathToPointer = (path: ReadonlyArray<PropertyKey>): string =>
  path.length === 0 ? "#" : `#/${path.map(String).join("/")}`

export const zodIssueToCode = (issue: ZodIssue): string => {
  if (issue.code === "invalid_type") {
    return issue.input === undefined
      ? "validation.field.required"
      : "validation.field.invalid_type"
  }

  if (issue.code === "too_small") {
    return "validation.field.too_small"
  }

  if (issue.code === "too_big") {
    return "validation.field.too_big"
  }

  if (issue.code === "invalid_format") {
    return "validation.field.invalid_string"
  }

  return "validation.field.invalid"
}
