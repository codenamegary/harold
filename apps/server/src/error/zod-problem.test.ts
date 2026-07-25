import { describe, expect, test } from "bun:test"
import { ZodError } from "zod"
import { zodIssueToCode, zodPathToPointer } from "./zod-problem"

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
        received: "undefined",
        path: ["name"],
        message: "Required",
      },
    ]).issues[0]!

    expect(zodIssueToCode(issue)).toBe("validation.field.required")
  })

  test("maps type mismatches to invalid_type code", () => {
    const issue = new ZodError([
      {
        code: "invalid_type",
        expected: "string",
        received: "number",
        path: ["name"],
        message: "Expected string",
      },
    ]).issues[0]!

    expect(zodIssueToCode(issue)).toBe("validation.field.invalid_type")
  })
})
