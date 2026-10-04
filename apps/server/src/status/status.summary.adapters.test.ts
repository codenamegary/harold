import { describe, expect, test } from "bun:test"
import { writeFileSync } from "node:fs"
import path from "node:path"
import { Config } from "../config/config"
import { makeInsertAgentSettingsRow } from "../agent-settings/agent.settings.sqlite.adapters"
import { makeInsertWorkspace } from "../workspace/workspace.sqlite.adapters"
import { bootTestDatabase } from "../test-support/test.harness"
import { composeStatusSummaryPorts } from "./status.summary.adapters"

const makeConfig = (dataDir: string): Config => ({
  host: "127.0.0.1",
  port: 3847,
  dataDir,
})

describe("composeStatusSummaryPorts", () => {
  test("reports the data dir, applied local api, and seeded advertised endpoint", async () => {
    const { database, dataDir } = await bootTestDatabase()
    const ports = composeStatusSummaryPorts({
      database,
      config: makeConfig(dataDir),
      env: {},
    })

    expect(ports.getDataDir()).toBe(dataDir)
    expect(ports.getLocalApi()).toEqual({ host: "127.0.0.1", port: 3847 })
    expect(ports.getAdvertisedEndpoint()).toEqual({ url: null, enabled: true })
  })

  test("prefers env bind overrides for the local api", async () => {
    const { database, dataDir } = await bootTestDatabase()
    const ports = composeStatusSummaryPorts({
      database,
      config: makeConfig(dataDir),
      env: { HAROLD_PORT: "9999" },
    })

    expect(ports.getLocalApi()).toEqual({ host: "127.0.0.1", port: 9999 })
  })

  test("counts enabled agents and registered workspaces", async () => {
    const { database, dataDir } = await bootTestDatabase()
    const insertRow = makeInsertAgentSettingsRow(database)
    insertRow({
      agentId: "custom-one",
      enabled: true,
      path: null,
      args: null,
      spawnSnapshot: null,
      updatedAt: "2026-01-01T00:00:00.000Z",
    })
    insertRow({
      agentId: "custom-two",
      enabled: false,
      path: null,
      args: null,
      spawnSnapshot: null,
      updatedAt: "2026-01-01T00:00:00.000Z",
    })
    const insertWorkspace = makeInsertWorkspace(database)
    insertWorkspace({ name: "One", canonicalPath: "/tmp/one" })
    insertWorkspace({ name: "Two", canonicalPath: "/tmp/two" })

    const ports = composeStatusSummaryPorts({
      database,
      config: makeConfig(dataDir),
      env: {},
    })

    expect(ports.getAgentSummary()).toEqual({ enabled: 1, needsAuth: null })
    expect(ports.getWorkspaceCount()).toBe(2)
  })

  test("reads the advertised endpoint from an existing settings.yml", async () => {
    const { database, dataDir } = await bootTestDatabase()
    writeFileSync(
      path.join(dataDir, "settings.yml"),
      [
        "advertisedUrl: https://harold.example.com",
        "advertisedUrlEnabled: false",
        "trustedProxies: []",
        "bindHost: 127.0.0.1",
        "bindPort: 3847",
        "logLevel: info",
        "logPath: null",
        "allowedRoots: []",
        "",
      ].join("\n"),
    )

    const ports = composeStatusSummaryPorts({
      database,
      config: makeConfig(dataDir),
      env: {},
    })

    expect(ports.getAdvertisedEndpoint()).toEqual({
      url: "https://harold.example.com",
      enabled: false,
    })
  })
})
