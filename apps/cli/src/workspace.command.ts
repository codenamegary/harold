import path, { basename } from "node:path"
import { Command } from "commander"
import pc from "picocolors"
import { CreateWorkspaceBodySchema } from "contracts/http/workspace"
import {
  daemonStateFilePath,
  makeDaemonStateFileStore,
  makeNodeProcessAlive,
} from "core/daemon-state/node.adapters"
import { makeReadLiveDaemonState, ReadLiveDaemonState } from "core/daemon-state/read.live.usecase"
import { expandHomePath } from "core/filesystem/expand.home.path"
import { CanonicalizePath } from "core/workspace/ports"
import { parseConfig } from "server/config"
import { makeCanonicalizePath } from "server/filesystem"
import { AgentDatabase, openDatabase } from "server/database"
import { makeRuntimeSettingsFileStore, seedDefaultsFromConfig } from "server/runtime-settings"
import { assembleWorkspaceSlice, WorkspaceSlice } from "server/workspace"
import { makeResolveWorkspaceReference } from "./workspace.resolve"
import {
  renderAmbiguousWorkspaceReference,
  renderDeleteWorkspaceError,
  renderRegisterWorkspaceError,
  renderWorkspaceAdded,
  renderWorkspaceDaemonRunningDeleteGuard,
  renderWorkspaceDaemonSessionsNotClosed,
  renderWorkspaceList,
  renderWorkspaceReferenceNotFound,
  renderWorkspaceRemoved,
} from "./workspace.render"

type WorkspaceCommandContext = Readonly<{
  slice: WorkspaceSlice
  canonicalizePath: CanonicalizePath
  database: AgentDatabase
  readLiveDaemonState: ReadLiveDaemonState
}>

const openWorkspaceCommandContext = (): WorkspaceCommandContext => {
  const config = parseConfig(process.env)
  const database = openDatabase({ dataDir: config.dataDir })
  const runtimeSettingsStore = makeRuntimeSettingsFileStore({
    dataDir: config.dataDir,
    seedDefaults: seedDefaultsFromConfig(config),
  })
  const slice = assembleWorkspaceSlice({
    database,
    getAllowedRoots: () => runtimeSettingsStore.get().allowedRoots,
    listLiveByWorkspaceRoot: () => [],
    closeWorkspaceSessions: async () => ({ failures: [] }),
    unbindWorkspaceSessions: () => undefined,
  })
  const readLiveDaemonState = makeReadLiveDaemonState({
    readDaemonState: makeDaemonStateFileStore({
      path: daemonStateFilePath(config.dataDir),
    }).read,
    isProcessAlive: makeNodeProcessAlive(),
  })

  return { slice, canonicalizePath: makeCanonicalizePath(), database, readLiveDaemonState }
}

const withWorkspaceCommandContext = async (
  run: (context: WorkspaceCommandContext) => Promise<void> | void,
): Promise<void> => {
  const context = openWorkspaceCommandContext()
  try {
    await run(context)
  } finally {
    context.database.close()
  }
}

export const defaultWorkspaceName = (workspacePath: string): string =>
  basename(path.resolve(expandHomePath(workspacePath)))

const reportError = (message: string): void => {
  console.log(pc.red(message))
  process.exitCode = 1
}

export const makeWorkspaceCommand = (): Command => {
  const command = new Command("workspace")
  command.description("manage registered workspaces")

  command
    .command("add")
    .description("register a workspace directory")
    .argument("<path>", "workspace directory path")
    .option("--name <name>", "workspace name (defaults to the directory name)")
    .action((workspacePath: string, options: { name?: string }) =>
      withWorkspaceCommandContext(async (context) => {
        const body = CreateWorkspaceBodySchema.safeParse({
          name: options.name ?? defaultWorkspaceName(workspacePath),
          path: workspacePath,
        })

        if (!body.success) {
          reportError("Workspace name must be 1 to 80 characters.")
          return
        }

        const result = context.slice.registerWorkspace(body.data)
        if (!result.ok) {
          reportError(renderRegisterWorkspaceError({ error: result.error, path: workspacePath }))
          return
        }

        console.log(renderWorkspaceAdded(result.value))
      }),
    )

  command
    .command("list")
    .description("list registered workspaces")
    .action(() =>
      withWorkspaceCommandContext((context) => {
        console.log(renderWorkspaceList({ workspaces: context.slice.listAll(), colors: pc }))
      }),
    )

  command
    .command("remove")
    .description("remove a registered workspace by id, canonical path, or unique name")
    .argument("<reference>", "workspace id, canonical path, or unique name")
    .option("--force", "skip the live-daemon active-session guard")
    .action((reference: string, options: { force?: boolean }) =>
      withWorkspaceCommandContext(async (context) => {
        const resolve = makeResolveWorkspaceReference({
          canonicalizePath: context.canonicalizePath,
          findWorkspaceById: context.slice.findById,
          listAllWorkspaces: context.slice.listAll,
        })

        const resolved = resolve(reference)
        if (!resolved.ok) {
          const message =
            resolved.error.kind === "ambiguous_name"
              ? renderAmbiguousWorkspaceReference(resolved.error)
              : renderWorkspaceReferenceNotFound(resolved.error.reference)
          reportError(message)
          return
        }

        const daemonRunning = context.readLiveDaemonState().ok
        if (daemonRunning && !options.force) {
          reportError(renderWorkspaceDaemonRunningDeleteGuard())
          return
        }

        const deleted = await context.slice.deleteWorkspace({
          workspaceId: resolved.value.id,
          force: false,
        })
        if (!deleted.ok) {
          reportError(
            renderDeleteWorkspaceError({ error: deleted.error, workspace: resolved.value }),
          )
          return
        }

        console.log(renderWorkspaceRemoved(resolved.value))
        if (daemonRunning) {
          console.log(renderWorkspaceDaemonSessionsNotClosed())
        }
      }),
    )

  return command
}
