import { describe, expect, test } from "bun:test"
import { readEnvBindOverrides } from "./env.bind.overrides"

describe("readEnvBindOverrides", () => {
  test("returns empty when env vars are unset", () => {
    expect(readEnvBindOverrides({})).toEqual({})
  })

  test("reads loopback host override", () => {
    expect(readEnvBindOverrides({ HAROLD_HOST: "127.0.0.1" })).toEqual({ bindHost: "127.0.0.1" })
  })

  test("reads port override", () => {
    expect(readEnvBindOverrides({ HAROLD_PORT: "4123" })).toEqual({
      bindPort: 4123,
    })
  })

  test("reads wildcard and private bind host overrides", () => {
    expect(readEnvBindOverrides({ HAROLD_HOST: "0.0.0.0" })).toEqual({ bindHost: "0.0.0.0" })
    expect(readEnvBindOverrides({ HAROLD_HOST: "10.0.0.236" })).toEqual({
      bindHost: "10.0.0.236",
    })
  })

  test("rejects a hostname", () => {
    expect(() => readEnvBindOverrides({ HAROLD_HOST: "harold.local" })).toThrow()
  })
})
