import { describe, expect, test } from "bun:test"
import { readEnvBindOverrides } from "./env.bind.overrides"

describe("readEnvBindOverrides", () => {
  test("returns empty when env vars are unset", () => {
    expect(readEnvBindOverrides({})).toEqual({})
  })

  test("reads port override", () => {
    expect(readEnvBindOverrides({ HAROLD_PORT: "4123" })).toEqual({
      bindPort: 4123,
    })
  })

  test("the bind host has no override: the wildcard bind is static", () => {
    expect(readEnvBindOverrides({ HAROLD_HOST: "0.0.0.0" })).toEqual({})
    expect(readEnvBindOverrides({ HAROLD_HOST: "harold.local" })).toEqual({})
  })
})
