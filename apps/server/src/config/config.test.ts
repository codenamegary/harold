import { describe, expect, test } from "bun:test"
import os from "node:os"
import path from "node:path"
import { parseConfig } from "./config"

describe("parseConfig", () => {
  test("defaults to loopback on port 3847", () => {
    const config = parseConfig({})

    expect(config).toEqual({
      host: "127.0.0.1",
      port: 3847,
      dataDir: path.join(os.homedir(), ".agent-server"),
    })
  })

  test("AGENT_SERVER_PORT overrides the default port", () => {
    const config = parseConfig({ AGENT_SERVER_PORT: "4000" })

    expect(config.port).toBe(4000)
  })

  test("AGENT_SERVER_HOST must be loopback", () => {
    expect(() => parseConfig({ AGENT_SERVER_HOST: "0.0.0.0" })).toThrow()
  })

  test("AGENT_SERVER_DATA_DIR overrides the default data dir", () => {
    const config = parseConfig({
      AGENT_SERVER_DATA_DIR: "/tmp/my-agent-server",
    })

    expect(config.dataDir).toBe("/tmp/my-agent-server")
  })

  test("expands ~ in AGENT_SERVER_DATA_DIR", () => {
    const config = parseConfig({ AGENT_SERVER_DATA_DIR: "~/custom-agent" })

    expect(config.dataDir).toBe(path.join(os.homedir(), "custom-agent"))
  })
})
