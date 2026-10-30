import { describe, expect, test } from "bun:test"
import { AgentDatabase } from "../persistence/database"
import { Config, DEFAULT_BIND_HOST } from "../config/config"
import {
  makeInsertAgentSettingsRow,
  makeListAgentSettingsRows,
} from "../agent-settings/agent.settings.sqlite.adapters"
import { makeInsertWorkspace } from "../workspace/workspace.sqlite.adapters"
import {
  makeRuntimeSettingsFileStore,
  seedDefaultsFromConfig,
} from "../runtime-settings/runtime-settings.file.adapters"
import { bootTestDatabase } from "../test-support/test.harness"
import { composeStatusSummaryPorts } from "./status.summary.assembly"

const makeConfig = (dataDir: string): Config => ({
  host: DEFAULT_BIND_HOST,
  port: 3847,
  dataDir,
})

const composePorts = (
  database: AgentDatabase,
  config: Config,
  env: Readonly<Record<string, string | undefined>>,
) => {
  const store = makeRuntimeSettingsFileStore({
    dataDir: config.dataDir,
    seedDefaults: seedDefaultsFromConfig(config),
  })
  return composeStatusSummaryPorts({
    config,
    database,
    getRuntimeSettings: store.get,
    listAgentSettingsRows: makeListAgentSettingsRows(database),
    env,
  })
}

describe("composeStatusSummaryPorts", () => {
  test("reports the data dir and the applied local api", async () => {
    const { database, dataDir } = await bootTestDatabase()
    const ports = composePorts(database, makeConfig(dataDir), {})

    expect(ports.getDataDir()).toBe(dataDir)
    expect(ports.getLocalApi()).toEqual({ host: DEFAULT_BIND_HOST, port: 3847 })
  })

  test("prefers env bind overrides for the local api port", async () => {
    const { database, dataDir } = await bootTestDatabase()
    const ports = composePorts(database, makeConfig(dataDir), { HAROLD_PORT: "9999" })

    expect(ports.getLocalApi()).toEqual({ host: DEFAULT_BIND_HOST, port: 9999 })
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

    const ports = composePorts(database, makeConfig(dataDir), {})

    expect(ports.getAgentSummary()).toEqual({ enabled: 1, needsAuth: null })
    expect(ports.getWorkspaceCount()).toBe(2)
  })
})
