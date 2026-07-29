import { mkdir, mkdtemp, rm } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { spawnFakeAcp, SpawnFakeAcpOptions, SpawnedFakeAcp } from "test-support/spawn"
import { createServer } from "../bootstrap/server"
import { parseConfig } from "../config/config"
import { openDatabase, AgentDatabase } from "../persistence/database"
import { createRuntime } from "../runtime/runtime"
import { WhichFn } from "../agent-settings/resolve-agent-path"
import { ValidateExecutablePathFn } from "../agent-settings/validate-agent-path"
import { SpawnedAgentProcess } from "../acp/supervisor/spawn-agent-process"
import { AcpSupervisor } from "../acp/supervisor/acp-supervisor-types"
import { Config } from "../config/config"

type TestServerApp = Awaited<ReturnType<typeof createServer>>["app"]

export type TestAppResources = {
  addTempDir: (dir: string) => void
  addApp: (app: TestServerApp) => void
  addFakeProcess: (fake: SpawnedFakeAcp) => void
  getLastFake: () => SpawnedFakeAcp | null
  takeTempDirs: () => string[]
  takeApps: () => TestServerApp[]
  takeFakeProcesses: () => SpawnedFakeAcp[]
}

export const createTestAppResources = (): TestAppResources => {
  const tempDirs: string[] = []
  const apps: TestServerApp[] = []
  const fakeProcesses: SpawnedFakeAcp[] = []

  return {
    addTempDir: (dir) => tempDirs.push(dir),
    addApp: (app) => apps.push(app),
    addFakeProcess: (fake) => fakeProcesses.push(fake),
    getLastFake: () => fakeProcesses.at(-1) ?? null,
    takeTempDirs: () => tempDirs.splice(0),
    takeApps: () => apps.splice(0),
    takeFakeProcesses: () => fakeProcesses.splice(0),
  }
}

export const createTempDataDir = async (resources: TestAppResources) => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "agent-server-test-"))
  resources.addTempDir(dir)
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
    resources.addFakeProcess(fake)
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
  resources.addApp(app)
  return { app, database, config, acpSupervisor, resources }
}

export const cleanupTestAppResources = async (resources: TestAppResources) => {
  resources.takeFakeProcesses().forEach((process) => process.kill())
  await Promise.all(resources.takeApps().map((app) => app.close()))
  await Promise.all(
    resources.takeTempDirs().map((dir) => rm(dir, { recursive: true, force: true })),
  )
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
