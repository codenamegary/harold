import path from "node:path"
import {
  cancel as clackCancel,
  confirm as clackConfirm,
  intro as clackIntro,
  isCancel as clackIsCancel,
  log as clackLog,
  multiselect as clackMultiselect,
  note as clackNote,
  outro as clackOutro,
  select as clackSelect,
  text as clackText,
} from "@clack/prompts"
import { Command } from "commander"
import pc from "picocolors"
import { expandHomePath } from "core/filesystem/expand.home.path"
import { isDescendantOf } from "core/filesystem/is.descendant.of"
import {
  daemonStateFilePath,
  makeDaemonStateFileStore,
  makeNodeProcessAlive,
  makeNodeRequestStop,
} from "core/daemon-state/node.adapters"
import {
  makeReadLiveDaemonState,
  ReadLiveDaemonStateResult,
} from "core/daemon-state/read.live.usecase"
import { makeStopLiveDaemon, StopLiveDaemon } from "core/daemon-state/stop.usecase"
import { makeNodeFetchStatusEndpoint } from "core/reachability/node.adapters"
import { parseConfig } from "server/config"
import { openDatabase } from "server/database"
import { assembleDeviceSlice } from "server/device"
import { makeCanonicalizePath } from "server/filesystem"
import { makeRuntimeSettingsFileStore, seedDefaultsFromConfig } from "server/runtime-settings"
import { makeUpdateRuntimeSettings } from "server/runtime-settings/update.usecase"
import { assembleWorkspaceSlice } from "server/workspace"
import { disableAgent, enableAgent, openAgentCli } from "./agent.command"
import { ConnectDeps, runConnect } from "./connect.command"
import { connectRecipes } from "./connect.recipes"
import {
  StartBackgroundDaemon,
  StartBackgroundDaemonError,
  makeBunSpawnBackgroundDaemon,
  makeStartBackgroundDaemon,
} from "./daemon.background"
import { PairActionDeps, executePair } from "./pair.command"
import { renderTerminalQr } from "./pair.qr"
import { readRunningView, renderRunningView, RunningView, RunningViewColors } from "./running.view"
import { SetupOptions, SetupPrompts, SetupWizardDeps, runSetupWizard } from "./setup.wizard"
import { defaultWorkspaceName } from "./workspace.command"

export type SetupCommandDeps = Readonly<{
  prompts: SetupPrompts
  cwd: () => string
  writeOut: (line: string) => void
  writeErr: (line: string) => void
  readLiveDaemonState: () => ReadLiveDaemonStateResult
  startDaemon: StartBackgroundDaemon
  stopDaemon: StopLiveDaemon
  readRunningView: () => RunningView
  colors: RunningViewColors
}>

export const makeClackPrompts = (): SetupPrompts => ({
  intro: (message) => clackIntro(message),
  outro: (message) => clackOutro(message),
  note: (message, title) => clackNote(message, title),
  info: (message) => clackLog.info(message),
  warn: (message) => clackLog.warn(message),
  step: (message) => clackLog.step(message),
  multiselect: (options) =>
    clackMultiselect<string>({
      message: options.message,
      options: options.options.map((option) => ({
        value: option.value,
        label: option.label,
        hint: option.hint,
      })),
      initialValues: [...options.initialValues],
    }),
  text: (options) =>
    clackText({
      message: options.message,
      placeholder: options.placeholder,
      defaultValue: options.defaultValue,
    }),
  select: (options) =>
    clackSelect<string>({
      message: options.message,
      options: options.options.map((option) => ({
        value: option.value,
        label: option.label,
        hint: option.hint,
      })),
      initialValue: options.initialValue,
    }),
  confirm: (options) =>
    clackConfirm({ message: options.message, initialValue: options.initialValue }),
  isCancel: (value): value is symbol => clackIsCancel(value),
  cancel: (message) => clackCancel(message),
})

const defaultSetupCommandDeps = (): SetupCommandDeps => {
  const config = parseConfig(process.env)
  const readLiveDaemonState = makeReadLiveDaemonState({
    readDaemonState: makeDaemonStateFileStore({
      path: daemonStateFilePath(config.dataDir),
    }).read,
    isProcessAlive: makeNodeProcessAlive(),
  })
  const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms))

  return {
    prompts: makeClackPrompts(),
    cwd: () => process.cwd(),
    writeOut: (line) => console.log(line),
    writeErr: (line) => console.error(line),
    readLiveDaemonState,
    startDaemon: makeStartBackgroundDaemon({
      spawn: makeBunSpawnBackgroundDaemon({
        execPath: process.execPath,
        entry: Bun.main,
        env: process.env,
      }),
      readLiveDaemonState,
      now: () => Date.now(),
      sleep,
    }),
    stopDaemon: makeStopLiveDaemon({
      readLiveDaemonState,
      requestStop: makeNodeRequestStop(),
      now: () => Date.now(),
      sleep,
    }),
    readRunningView: () => readRunningView(config),
    colors: pc,
  }
}

export const makeSetupCommandDeps = (
  overrides: Partial<SetupCommandDeps> = {},
): SetupCommandDeps => ({ ...defaultSetupCommandDeps(), ...overrides })

export const parseAgentIds = (raw: string | undefined): readonly string[] | undefined => {
  if (raw === undefined) {
    return undefined
  }

  const ids = raw
    .split(",")
    .map((id) => id.trim())
    .filter((id) => id !== "")

  return [...new Set(ids)]
}

const renderStartDaemonError = (error: StartBackgroundDaemonError, port: number): string => {
  switch (error.kind) {
    case "daemon_exited":
      return `Harold exited before it was ready (exit code ${error.code}). Check for a process already using port ${port}, then run \`harold setup\` again.`
    case "timed_out":
      return "Timed out waiting for Harold to start. Check `harold logs`, then run `harold setup` again."
  }
}

/**
 * Composes the agent, workspace, reachability, and pairing batches into one
 * interactive flow. When no daemon is running, setup starts one detached in
 * the background first: reachability verification and pairing both need it
 * answering, and the daemon keeps serving after setup exits. The running view
 * is printed when the wizard ends against a live daemon.
 */
export const runSetup = async (options: SetupOptions, deps: SetupCommandDeps): Promise<number> => {
  const config = parseConfig(process.env)
  const dataDir = config.dataDir
  const cwd = deps.cwd()

  const liveDaemon = deps.readLiveDaemonState()
  const startedDaemon = liveDaemon.ok ? undefined : await deps.startDaemon()

  if (startedDaemon !== undefined && !startedDaemon.ok) {
    deps.writeErr(renderStartDaemonError(startedDaemon.error, config.port))
    return 1
  }

  const database = openDatabase({ dataDir })
  const settingsStore = makeRuntimeSettingsFileStore({
    dataDir,
    seedDefaults: seedDefaultsFromConfig(config),
  })
  const agentCli = openAgentCli({ dataDir })

  try {
    agentCli.ensureCatalogRows()
    const workspaceSlice = assembleWorkspaceSlice({
      database,
      getAllowedRoots: () => settingsStore.get().allowedRoots,
      listLiveByWorkspaceRoot: () => [],
      closeWorkspaceSessions: async () => ({ failures: [] }),
      unbindWorkspaceSessions: () => undefined,
    })
    const updateRuntimeSettings = makeUpdateRuntimeSettings({
      getSettings: settingsStore.get,
      saveSettings: settingsStore.save,
      canonicalizePath: makeCanonicalizePath(),
      listAllWorkspaces: workspaceSlice.listAll,
      deleteWorkspace: workspaceSlice.deleteWorkspace,
    })

    const which = (binary: string): boolean => Bun.which(binary) !== null
    const writeLine = (line: string): void => deps.writeOut(line)

    const connectDeps: ConnectDeps = {
      fetchStatus: makeNodeFetchStatusEndpoint(),
      makeSettingsStore: () => settingsStore,
      which,
      writeLine,
      colors: pc,
    }

    // The device slice shares the wizard's settings store so the pairing
    // step sees an advertised URL persisted earlier in the same run.
    const deviceSlice = assembleDeviceSlice({
      database,
      loopbackEndpoint: `http://${config.host}:${config.port}`,
      getAdvertisedEndpointSettings: () => {
        const settings = settingsStore.get()
        return {
          advertisedUrl: settings.advertisedUrl,
          advertisedUrlEnabled: settings.advertisedUrlEnabled,
        }
      },
    })

    const pairDeps: PairActionDeps = {
      createPairingCode: deviceSlice.createPairingCode,
      getPairingCodeById: deviceSlice.getPairingCodeById,
      renderTerminalQr,
      colors: { bold: pc.bold, dim: pc.dim },
      writeOut: deps.writeOut,
      writeErr: deps.writeErr,
      now: () => new Date(),
      sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
    }

    const wizardDeps: SetupWizardDeps = {
      dataDir,
      cwd,
      prompts: deps.prompts,
      colors: { red: pc.red, yellow: pc.yellow },
      writeLine,
      agents: {
        list: () => agentCli.list(),
        enable: (agentId) => enableAgent(agentCli, agentId),
        disable: (agentId) => disableAgent(agentCli, agentId),
      },
      workspaces: {
        list: () => workspaceSlice.listAll(),
        register: async (workspacePath) => {
          const absolutePath = path.resolve(cwd, expandHomePath(workspacePath))
          const roots = settingsStore.get().allowedRoots
          const allowed = roots.some((root) =>
            isDescendantOf({ path: root, candidatePath: absolutePath }),
          )

          if (!allowed) {
            const updated = await updateRuntimeSettings({
              body: { allowedRoots: [...roots, absolutePath] },
              force: false,
            })
            if (!updated.ok) {
              return { ok: false, error: { kind: "outside_allowed_root" } }
            }
          }

          return workspaceSlice.registerWorkspace({
            name: defaultWorkspaceName(workspacePath),
            path: workspacePath,
          })
        },
      },
      recipes: connectRecipes.map((recipe) => {
        const detection = recipe.detect({ which })
        return {
          id: recipe.id,
          label: recipe.label,
          hint: detection.detail,
          guide: () => recipe.guide({ detection, writeLine }),
        }
      }),
      reachability: {
        verifyAndPersist: async (advertisedUrl) =>
          (await runConnect({ options: { advertisedUrl }, dataDir, deps: connectDeps })) === 0,
      },
      isDaemonRunning: () => deps.readLiveDaemonState().ok,
      pair: async () =>
        (await executePair(pairDeps, { endpoint: undefined, wait: true, json: false })) === 0,
    }

    const code = await runSetupWizard(wizardDeps, options)

    if (code !== 0 && startedDaemon !== undefined) {
      const stopped = await deps.stopDaemon()
      if (!stopped.ok) {
        deps.writeErr(
          "Setup could not stop the daemon it started. Run `harold stop` and try again.",
        )
      }
    }

    if (code === 0 && deps.readLiveDaemonState().ok) {
      deps.writeOut(renderRunningView(deps.readRunningView(), deps.colors))
    }

    return code
  } finally {
    database.close()
    agentCli.close()
  }
}

const setupOptionsFrom = (options: {
  agents?: string
  workspace?: string
  advertisedUrl?: string
  pair: boolean
}): SetupOptions => ({
  agents: parseAgentIds(options.agents),
  workspace: options.workspace,
  advertisedUrl: options.advertisedUrl,
  pair: options.pair,
})

export const makeSetupCommand = (overrides: Partial<SetupCommandDeps> = {}): Command => {
  const command = new Command("setup")
  command.description("configure agents, a workspace, reachability, and pairing")
  command
    .option("--agents <ids>", "comma-separated agent ids to enable")
    .option("--workspace <path>", "workspace directory to register")
    .option("--advertised-url <url>", "advertised endpoint URL devices pair against")
    .option("--no-pair", "skip the pairing step")

  command.action(
    async (options: {
      agents?: string
      workspace?: string
      advertisedUrl?: string
      pair: boolean
    }) => {
      const deps: SetupCommandDeps = makeSetupCommandDeps(overrides)
      process.exitCode = await runSetup(setupOptionsFrom(options), deps)
    },
  )

  return command
}
