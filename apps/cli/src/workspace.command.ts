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
import { makeCreateDirectory, CreateDirectory } from "core/filesystem/create.directory.usecase"
import { expandHomePath } from "core/filesystem/expand.home.path"
import { CanonicalizePath } from "core/workspace/ports"
import { parseConfig } from "server/config"
import {
  makeCanonicalizePath,
  makeCreateDirectory as makeCreateDirectoryAdapter,
  makeReadDirectoryEntries,
} from "server/filesystem"
import { AgentDatabase, openDatabase } from "server/database"
import { assembleWorkspaceSlice, WorkspaceSlice } from "server/workspace"
import { makeResolveWorkspaceReference } from "./workspace.resolve"
import {
  renderAmbiguousWorkspaceReference,
  renderCloneDirectoryError,
  renderDeleteWorkspaceError,
  renderFolderCreatedWithoutWorkspace,
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
  createDirectory: CreateDirectory
  database: AgentDatabase
  readLiveDaemonState: ReadLiveDaemonState
}>

const openWorkspaceCommandContext = (): WorkspaceCommandContext => {
  const config = parseConfig(process.env)
  const database = openDatabase({ dataDir: config.dataDir })
  const canonicalizePath = makeCanonicalizePath()
  const slice = assembleWorkspaceSlice({
    database,
    canonicalizePath,
    readDirectoryEntries: makeReadDirectoryEntries(),
    listLiveByWorkspaceRoot: () => [],
    closeWorkspaceSessions: async () => ({ failures: [] }),
    unbindWorkspaceSessions: () => undefined,
  })
  const createDirectory = makeCreateDirectory({
    canonicalizePath,
    createDirectory: makeCreateDirectoryAdapter(),
  })
  const readLiveDaemonState = makeReadLiveDaemonState({
    readDaemonState: makeDaemonStateFileStore({
      path: daemonStateFilePath(config.dataDir),
    }).read,
    isProcessAlive: makeNodeProcessAlive(),
  })

  return { slice, canonicalizePath, createDirectory, database, readLiveDaemonState }
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

export const deriveCloneFolderName = (url: string): string => {
  const trimmed = url.replace(/\/+$/, "")
  const withoutScheme = trimmed.replace(/^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//, "")
  const segments = withoutScheme.split(/[/:]/).filter((segment) => segment.length > 0)

  // A host-only url has no repository name to reuse.
  if (segments.length < 2) {
    return ""
  }

  const name = segments[segments.length - 1] ?? ""
  return name.endsWith(".git") ? name.slice(0, -".git".length) : name
}

const reportError = (message: string): void => {
  console.log(pc.red(message))
  process.exitCode = 1
}

const nameValidationMessage = "Workspace name must be 1 to 80 characters."

export const makeWorkspaceCommand = (): Command => {
  const command = new Command("workspace")
  command.description("manage registered workspaces")

  command
    .command("add")
    .description("open a project folder as a workspace")
    .argument("<path>", "any existing project folder")
    .option("--name <name>", "workspace name (defaults to the directory name)")
    .action((workspacePath: string, options: { name?: string }) =>
      withWorkspaceCommandContext(async (context) => {
        const body = CreateWorkspaceBodySchema.safeParse({
          source: "folder",
          path: workspacePath,
          ...(options.name === undefined ? {} : { name: options.name }),
        })

        if (!body.success) {
          reportError(nameValidationMessage)
          return
        }

        const result = await context.slice.registerWorkspace(body.data)
        if (!result.ok) {
          reportError(renderRegisterWorkspaceError({ error: result.error, path: workspacePath }))
          return
        }

        console.log(renderWorkspaceAdded({ workspace: result.value, created: result.created }))
      }),
    )

  command
    .command("clone")
    .description("clone a git repository into a new folder and open it as a workspace")
    .argument("<url>", "git clone target")
    .requiredOption("--into <parent>", "existing parent folder for the new repository folder")
    .option("--folder-name <name>", "new folder name (defaults to the repository name)")
    .option("--name <name>", "workspace name (defaults to the folder name)")
    .action((url: string, options: { into: string; folderName?: string; name?: string }) =>
      withWorkspaceCommandContext(async (context) => {
        const folderName = options.folderName ?? deriveCloneFolderName(url)
        const destination = path.join(options.into, folderName)

        const created = await context.createDirectory({
          parent: options.into,
          name: folderName,
        })
        if (!created.ok) {
          reportError(
            renderCloneDirectoryError({
              error: created.error,
              parent: options.into,
              destination,
            }),
          )
          return
        }

        const body = CreateWorkspaceBodySchema.safeParse({
          source: "git",
          url,
          path: created.value.path,
          ...(options.name === undefined ? {} : { name: options.name }),
        })
        if (!body.success) {
          reportError(
            `${nameValidationMessage}\n${renderFolderCreatedWithoutWorkspace(created.value.path)}`,
          )
          return
        }

        const result = await context.slice.registerWorkspace(body.data)
        if (!result.ok) {
          const message = renderRegisterWorkspaceError({
            error: result.error,
            path: created.value.path,
          })
          reportError(
            result.error.kind === "clone_failed"
              ? message
              : `${message}\n${renderFolderCreatedWithoutWorkspace(created.value.path)}`,
          )
          return
        }

        console.log(renderWorkspaceAdded({ workspace: result.value, created: result.created }))
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
