import { describe, expect, test } from "bun:test"
import { makeDeviceNameMatcher } from "./device.name.pattern"

describe("device name pattern", () => {
  test("matches names case-insensitively with a wildcard", () => {
    const matches = makeDeviceNameMatcher("*gphone*")

    expect(matches("GPhone Pro")).toBe(true)
    expect(matches("Work GPHONE")).toBe(true)
  })

  test("requires literal characters to match exactly", () => {
    const matches = makeDeviceNameMatcher("gphone")

    expect(matches("GPhone")).toBe(true)
    expect(matches("GPhone Pro")).toBe(false)
  })

  test("treats regex metacharacters literally", () => {
    const matches = makeDeviceNameMatcher("Pixel (2)+")

    expect(matches("Pixel (2)+")).toBe(true)
    expect(matches("Pixel 2")).toBe(false)
  })
})
