import { describe, expect, test } from "bun:test"
import { damerauLevenshtein } from "./damerau.levenshtein"

describe("damerauLevenshtein", () => {
  test("is zero for the same string", () => {
    expect(damerauLevenshtein("plan", "plan")).toBe(0)
  })

  test("counts inserts, deletes, and substitutions", () => {
    expect(damerauLevenshtein("lan", "plan")).toBe(1)
    expect(damerauLevenshtein("plan", "lan")).toBe(1)
    expect(damerauLevenshtein("plan", "play")).toBe(1)
    expect(damerauLevenshtein("", "plan")).toBe(4)
  })

  test("counts an adjacent swap as one edit", () => {
    expect(damerauLevenshtein("plna", "plan")).toBe(1)
  })
})
