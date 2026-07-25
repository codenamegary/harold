import { describe, expect, test } from "bun:test"
import { parseConfig } from "./config"

describe("parseConfig", () => {
  test("defaults to loopback on port 3847", () => {
    const config = parseConfig({})

    expect(config).toEqual({
      host: "127.0.0.1",
      port: 3847,
    })
  })

  test("AGENT_SERVER_PORT overrides the default port", () => {
    const config = parseConfig({ AGENT_SERVER_PORT: "4000" })

    expect(config.port).toBe(4000)
  })

  test("AGENT_SERVER_HOST must be loopback", () => {
    expect(() => parseConfig({ AGENT_SERVER_HOST: "0.0.0.0" })).toThrow()
  })
})
