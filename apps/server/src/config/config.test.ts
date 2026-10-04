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
      dataDir: path.join(os.homedir(), ".harold"),
    })
  })

  test("HAROLD_PORT overrides the default port", () => {
    const config = parseConfig({ HAROLD_PORT: "4000" })

    expect(config.port).toBe(4000)
  })

  test("HAROLD_HOST must be loopback", () => {
    expect(() => parseConfig({ HAROLD_HOST: "0.0.0.0" })).toThrow()
  })

  test("HAROLD_DATA_DIR overrides the default data dir", () => {
    const config = parseConfig({
      HAROLD_DATA_DIR: "/tmp/my-harold",
    })

    expect(config.dataDir).toBe("/tmp/my-harold")
  })

  test("expands ~ in HAROLD_DATA_DIR", () => {
    const config = parseConfig({ HAROLD_DATA_DIR: "~/custom-harold" })

    expect(config.dataDir).toBe(path.join(os.homedir(), "custom-harold"))
  })
})
