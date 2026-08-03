import { describe, expect, test } from "bun:test"
import { readEnvBindOverrides } from "./env.bind.overrides"

describe("readEnvBindOverrides", () => {
  test("returns empty when env vars are unset", () => {
    expect(readEnvBindOverrides({})).toEqual({})
  })

  test("reads loopback host override", () => {
    expect(
      readEnvBindOverrides({ AGENT_SERVER_HOST: "127.0.0.1" }),
    ).toEqual({ bindHost: "127.0.0.1" })
  })

  test("reads port override", () => {
    expect(readEnvBindOverrides({ AGENT_SERVER_PORT: "4123" })).toEqual({
      bindPort: 4123,
    })
  })

  test("rejects non-loopback host", () => {
    expect(() =>
      readEnvBindOverrides({ AGENT_SERVER_HOST: "0.0.0.0" }),
    ).toThrow()
  })
})
