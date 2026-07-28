import { mkdir, mkdtemp, rm } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { spawnFakeAcp, SpawnFakeAcpOptions, SpawnedFakeAcp } from "test-support/spawn"
import { createServer } from "../bootstrap/create-server"
import { parseConfig } from "../config/config"
import { openDatabase, AgentDatabase } from "../persistence/open-database"
import { createRuntime } from "../runtime/runtime"
import { WhichFn } from "../agent-settings/resolve-agent-path"
import { ValidateExecutablePathFn } from "../agent-settings/validate-agent-path"
import { SpawnedAgentProcess } from "../acp/supervisor/spawn-agent-process"
import { AcpSupervisor } from "../acp/supervisor/acp-supervisor-types"
import { Config } from "../config/config"

export type TestAppResources = {
  tempDirs: string[]
  apps: Awaited<ReturnType<typeof createServer>>["app"][]
  fakeProcesses: Array<{ kill: () => void }>
  lastFake: SpawnedFakeAcp | null
}

export const createTestAppResources = (): TestAppResources => ({
  tempDirs: [],
  apps: [],
  fakeProcesses: [],
  lastFake: null,
})

export const createTempDataDir = async (resources: TestAppResources) => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "agent-server-test-"))
  resources.tempDirs.push(dir)
  return dir
}

export const createWorkspaceDir = async (parent: string, name: string) => {
  const dir = path.join(parent, name)
  await mkdir(dir)
  return dir
}

export const acceptTestExecutablePath: ValidateExecutablePathFn = () => true

export const createFakeSpawnFn = (
  resources: TestAppResources,
  fakeOptions: SpawnFakeAcpOptions = {},
) => {
  const spawnAgentProcessFn = (): SpawnedAgentProcess => {
    const fake = spawnFakeAcp(fakeOptions)
    resources.fakeProcesses.push(fake)
    resources.lastFake = fake
    return {
      stdin: fake.stdin,
      stdout: fake.stdout,
      kill: () => {
        fake.kill()
      },
      waitForExit: () => fake.process.exited,
    }
  }

  return { spawnAgentProcessFn }
}

export type TestApp = {
  app: Awaited<ReturnType<typeof createServer>>["app"]
  database: AgentDatabase
  config: Config
  acpSupervisor: AcpSupervisor
  resources: TestAppResources
}

export const createTestApp = async (
  resources: TestAppResources,
  dataDir: string,
  whichFn?: WhichFn,
  validateExecutablePathFn: ValidateExecutablePathFn = acceptTestExecutablePath,
  fakeAcpOptions: SpawnFakeAcpOptions = {
    capabilities: { loadSession: true, sessionClose: true },
    sessionNewSessionId: "fake-session-new",
    sessionLoadSessionId: "fake-session-new",
  },
): Promise<TestApp> => {
  const config = parseConfig({
    AGENT_SERVER_HOST: "127.0.0.1",
    AGENT_SERVER_PORT: "0",
    AGENT_SERVER_DATA_DIR: dataDir,
  })
  const database = openDatabase({ dataDir: config.dataDir })
  const runtime = createRuntime("0.1.0")
  const { spawnAgentProcessFn } = createFakeSpawnFn(resources, fakeAcpOptions)
  const { app, acpSupervisor } = await createServer({
    config,
    runtime,
    database,
    whichFn,
    validateExecutablePathFn,
    spawnAgentProcessFn,
  })
  resources.apps.push(app)
  return { app, database, config, acpSupervisor, resources }
}

export const cleanupTestAppResources = async (resources: TestAppResources) => {
  resources.fakeProcesses.splice(0).forEach((process) => process.kill())
  await Promise.all(resources.apps.splice(0).map((app) => app.close()))
  await Promise.all(resources.tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })))
  resources.lastFake = null
}

export const seedWorkspace = async (
  app: Awaited<ReturnType<typeof createServer>>["app"],
  dataDir: string,
) => {
  const workspaceDir = await createWorkspaceDir(dataDir, "project")
  const response = await app.inject({
    method: "POST",
    url: "/v1/workspaces",
    payload: { name: "Project", path: workspaceDir },
  })
  const workspace = JSON.parse(response.body) as { id: string }
  return { workspaceId: workspace.id, workspaceDir }
}

export const enableAgent = async (
  app: Awaited<ReturnType<typeof createServer>>["app"],
  agentId: "cursor" | "claude",
  whichFn?: WhichFn,
) => {
  const detectedPath = "/usr/local/bin/agent"
  const resolvedWhichFn: WhichFn =
    whichFn ?? ((binaryName) => (binaryName === "agent" ? detectedPath : undefined))

  if (agentId === "cursor") {
    const response = await app.inject({
      method: "PATCH",
      url: "/v1/settings/agents/cursor",
      payload: { enabled: true, path: resolvedWhichFn("agent") ?? detectedPath },
    })
    if (response.statusCode !== 200) {
      throw new Error(`failed to enable agent: ${response.body}`)
    }
  }
}
