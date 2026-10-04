import { describe, expect, test } from "bun:test"
import { parseLogLevel, parsePositiveInt } from "./logs.args"

describe("parsePositiveInt", () => {
  test("parses a positive integer", () => {
    expect(parsePositiveInt("42")).toBe(42)
  })

  test("rejects zero, negatives, and non-integers", () => {
    expect(() => parsePositiveInt("0")).toThrow()
    expect(() => parsePositiveInt("-1")).toThrow()
    expect(() => parsePositiveInt("1.5")).toThrow()
    expect(() => parsePositiveInt("abc")).toThrow()
  })
})

describe("parseLogLevel", () => {
  test("accepts every valid log level", () => {
    for (const level of ["fatal", "error", "warn", "info", "debug", "trace"]) {
      expect(parseLogLevel(level)).toBe(level)
    }
  })

  test("rejects unknown levels", () => {
    expect(() => parseLogLevel("verbose")).toThrow()
  })
})
