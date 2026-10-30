import { describe, expect, test } from "bun:test"
import os from "node:os"
import path from "node:path"
import { DEFAULT_BIND_HOST, parseConfig } from "./config"

describe("parseConfig", () => {
  test("defaults to the static wildcard bind on port 3847", () => {
    const config = parseConfig({})

    expect(config).toEqual({
      host: DEFAULT_BIND_HOST,
      port: 3847,
      dataDir: path.join(os.homedir(), ".harold"),
    })
  })

  test("HAROLD_PORT overrides the default port", () => {
    const config = parseConfig({ HAROLD_PORT: "4000" })

    expect(config.port).toBe(4000)
  })

  test("there is no HAROLD_HOST: the bind host is not configurable", () => {
    expect(parseConfig({ HAROLD_HOST: "127.0.0.1" }).host).toBe(DEFAULT_BIND_HOST)
    expect(parseConfig({ HAROLD_HOST: "harold.local" }).host).toBe(DEFAULT_BIND_HOST)
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
