import { mkdtemp, rm } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { spawnFakeAcp, SpawnedFakeAcp, SpawnFakeAcpOptions } from "test-support/spawn"
import { createServer, CreateServerOptions } from "../bootstrap/server"
import { Config, ConfigSchema, parseConfig } from "../config/config"
import { AgentDatabase, openDatabase } from "../persistence/database"
import { createRuntime, Runtime } from "../runtime/runtime"
import { SpawnAgentProcessFn } from "../acp/supervisor/supervisor.ports"
import { SpawnedAgentProcess } from "../acp/supervisor/models"
import { acceptTestExecutablePath } from "./test.app"

type Cleanup = () => void | Promise<unknown>
const phases = ["supervisor", "app", "database", "child", "directory"] as const
type Phase = (typeof phases)[number]
type Scope = {
  pending: Set<Promise<unknown>>
  actions: Record<Phase, Set<Cleanup>>
}
const scopes = new Set<Scope>()

const createScope = (): Scope => {
  const scope: Scope = {
    pending: new Set(),
    actions: {
      supervisor: new Set(),
      app: new Set(),
      database: new Set(),
      child: new Set(),
      directory: new Set(),
    },
  }
  scopes.add(scope)
  return scope
}

const disposeTails = new WeakMap<Scope, Promise<void>>()

const disposeScope = async (scope: Scope, selected: readonly Phase[]): Promise<unknown[]> => {
  const run = (disposeTails.get(scope) ?? Promise.resolve()).then(async () => {
    const errors: unknown[] = []
    for (const phase of selected) {
      for (const close of scope.actions[phase]) {
        scope.actions[phase].delete(close)
        try {
          await close()
        } catch (error) {
          errors.push(error)
        }
      }
    }
    return errors
  })
  disposeTails.set(
    scope,
    run.then(
      () => undefined,
      () => undefined,
    ),
  )
  return run
}

const disposeScopes = async (owned: readonly Scope[], selected: readonly Phase[] = phases) => {
  const errors: unknown[] = []
  for (const phase of selected) {
    for (const scope of owned) {
      errors.push(...(await disposeScope(scope, [phase])))
    }
  }
  if (errors.length > 0) {
    throw new AggregateError(errors, "Test resource cleanup failed")
  }
}

const trackBoot = <T>(scope: Scope, boot: () => Promise<T>) => {
  const result = Promise.resolve()
    .then(boot)
    .catch(async (error: unknown) => {
      const cleanupErrors = await disposeScope(scope, phases)
      if (cleanupErrors.length > 0) {
        throw new AggregateError([error, ...cleanupErrors], "Test boot and cleanup failed")
      }
      throw error
    })
  const settled = result.then(
    () => undefined,
    () => undefined,
  )
  scope.pending.add(settled)
  void settled.then(() => scope.pending.delete(settled))
  return result
}

export const bootTestDirectory = () => {
  const scope = createScope()
  return trackBoot(scope, async () => {
    const dataDir = await mkdtemp(path.join(os.tmpdir(), "agent-server-test-"))
    scope.actions.directory.add(() => rm(dataDir, { recursive: true, force: true }))
    return dataDir
  })
}

export type TestChild = Pick<SpawnedAgentProcess, "kill" | "waitForExit">

const ownChild = <T extends TestChild>(scope: Scope, child: T): T => {
  scope.actions.child.add(async () => {
    child.kill()
    await child.waitForExit()
  })
  return child
}

export const registerTestChild = <T extends TestChild>(child: T): T =>
  ownChild(createScope(), child)

export const registerTestFakeProcess = (fake: SpawnedFakeAcp): SpawnedFakeAcp => {
  registerTestChild({ kill: fake.kill, waitForExit: () => fake.process.exited })
  return fake
}

export const registerTestApp = <T extends { close: () => unknown }>(app: T): T => {
  createScope().actions.app.add(async () => {
    await app.close()
  })
  return app
}

export const registerTestCleanup = (close: Cleanup): void => {
  createScope().actions.database.add(close)
}

export type TestDatabase = {
  database: AgentDatabase
  dataDir: string
  reopen: () => Promise<TestDatabase>
}

const bootDatabaseInDirectory = (dataDir: string): Promise<TestDatabase> => {
  const scope = createScope()
  return trackBoot(scope, async () => {
    const database = openDatabase({ dataDir })
    scope.actions.database.add(() => database.close())
    return {
      database,
      dataDir,
      reopen: async () => {
        await disposeScopes([scope])
        return bootDatabaseInDirectory(dataDir)
      },
    }
  })
}

export const bootTestDatabase = async (): Promise<TestDatabase> =>
  bootDatabaseInDirectory(await bootTestDirectory())

type ServerOverrides = Omit<CreateServerOptions, "config" | "database" | "runtime">
export type TestAppContext = {
  database: AgentDatabase
  config: Config
  runtime: Runtime
  dataDir: string
  registerTestApp: typeof registerTestApp
  registerTestChild: typeof registerTestChild
  registerTestFakeProcess: typeof registerTestFakeProcess
}
export type TestAppOptions = ServerOverrides & {
  config?: Partial<Config>
  runtime?: Runtime
  fakeAcpOptions?: SpawnFakeAcpOptions
  setup?: (
    context: TestAppContext,
  ) => Partial<CreateServerOptions> | void | Promise<Partial<CreateServerOptions> | void>
}
export type TestApp = Awaited<ReturnType<typeof createServer>> &
  Omit<TestAppContext, "registerTestApp" | "registerTestChild" | "registerTestFakeProcess"> & {
    reopen: (options?: TestAppOptions) => Promise<TestApp>
  }

const bootAppInDirectory = (
  dataDir: string,
  options: TestAppOptions,
  scope = createScope(),
): Promise<TestApp> => {
  return trackBoot(scope, async () => {
    const config = ConfigSchema.parse({
      ...parseConfig({ AGENT_SERVER_PORT: "0", AGENT_SERVER_DATA_DIR: dataDir }),
      ...options.config,
      dataDir,
    })
    const database = openDatabase({ dataDir })
    scope.actions.database.add(() => database.close())
    const runtime = options.runtime ?? createRuntime("0.1.0")
    const overrides = await options.setup?.({
      database,
      config,
      runtime,
      dataDir,
      registerTestApp,
      registerTestChild,
      registerTestFakeProcess,
    })
    const fakeSpawn: SpawnAgentProcessFn = () => {
      const fake = spawnFakeAcp(
        options.fakeAcpOptions ?? {
          capabilities: { loadSession: true, sessionClose: true, sessionList: true },
          sessionNewSessionId: "fake-session-new",
          sessionLoadSessionId: "fake-session-new",
        },
      )
      return {
        stdin: fake.stdin,
        stdout: fake.stdout,
        kill: fake.kill,
        waitForExit: () => fake.process.exited,
      }
    }
    const spawn = overrides?.spawnAgentProcessFn ?? options.spawnAgentProcessFn ?? fakeSpawn
    const serverOptions = {
      ...options,
      ...overrides,
      validateExecutablePathFn: options.validateExecutablePathFn ?? acceptTestExecutablePath,
      config: ConfigSchema.parse({ ...config, ...overrides?.config, dataDir }),
      database,
      runtime: overrides?.runtime ?? runtime,
      spawnAgentProcessFn: (input: Parameters<SpawnAgentProcessFn>[0]) =>
        ownChild(scope, spawn(input)),
    }
    if (serverOptions.acpSupervisor) {
      scope.actions.supervisor.add(() => serverOptions.acpSupervisor!.stop())
    }
    const result = await createServer(serverOptions)
    if (!serverOptions.acpSupervisor) {
      scope.actions.supervisor.add(() => result.acpSupervisor.stop())
    }
    scope.actions.app.add(() => result.app.close())
    return {
      ...result,
      database,
      config: serverOptions.config,
      runtime: serverOptions.runtime,
      dataDir,
      reopen: async (nextOptions = {}) => {
        await disposeScopes([scope], ["supervisor", "app", "database", "child"])
        return bootAppInDirectory(dataDir, {
          ...options,
          ...nextOptions,
          config: { ...options.config, ...nextOptions.config },
        })
      },
    }
  })
}

export const bootTestApp = (options: TestAppOptions = {}): Promise<TestApp> => {
  const scope = createScope()
  return trackBoot(scope, async () => {
    const dataDir = await mkdtemp(path.join(os.tmpdir(), "agent-server-test-"))
    scope.actions.directory.add(() => rm(dataDir, { recursive: true, force: true }))
    return bootAppInDirectory(dataDir, options, scope)
  })
}

const settlePendingBoots = async (): Promise<void> => {
  const pending = [...scopes].flatMap((scope) => [...scope.pending])
  if (pending.length === 0) return
  await Promise.all(pending)
  await settlePendingBoots()
}

export const disposeTestResources = async () => {
  await settlePendingBoots()
  const owned = [...scopes]
  try {
    await disposeScopes(owned)
  } finally {
    owned.forEach((scope) => scopes.delete(scope))
  }
}
