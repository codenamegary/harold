import { describe, expect, test } from "bun:test"
import { ZodError } from "zod"
import { zodIssueToCode, zodPathToPointer } from "./zod.problem"

describe("zodPathToPointer", () => {
  test("maps field paths to JSON pointers", () => {
    expect(zodPathToPointer(["name"])).toBe("#/name")
    expect(zodPathToPointer(["path"])).toBe("#/path")
    expect(zodPathToPointer(["items", 0])).toBe("#/items/0")
  })
})

describe("zodIssueToCode", () => {
  test("maps missing fields to required code", () => {
    const issue = new ZodError([
      {
        code: "invalid_type",
        expected: "string",
        path: ["name"],
        message: "Required",
        input: undefined,
      },
    ]).issues[0]

    expect(zodIssueToCode(issue)).toBe("validation.field.required")
  })

  test("maps type mismatches to invalid_type code", () => {
    const issue = new ZodError([
      {
        code: "invalid_type",
        expected: "string",
        path: ["name"],
        message: "Expected string",
        input: 123,
      },
    ]).issues[0]

    expect(zodIssueToCode(issue)).toBe("validation.field.invalid_type")
  })

  test("maps invalid_format to invalid_string code", () => {
    const issue = new ZodError([
      {
        code: "invalid_format",
        format: "datetime",
        path: ["createdAt"],
        message: "Invalid ISO datetime",
        input: "not-a-date",
      },
    ]).issues[0]

    expect(zodIssueToCode(issue)).toBe("validation.field.invalid_string")
  })
})
