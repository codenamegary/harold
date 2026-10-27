import { Workspace } from "contracts/http/workspace"
import { CreateDirectoryError } from "core/filesystem/create.directory.usecase"
import { RegisterWorkspaceError } from "core/workspace/errors"
import { DeleteWorkspaceError } from "core/workspace/ports"

export type WorkspaceColors = Readonly<{
  green: (text: string) => string
  yellow: (text: string) => string
  red: (text: string) => string
  dim: (text: string) => string
}>

const shortIdLength = "ws_".length + 8

const shortWorkspaceId = (id: string): string => id.slice(0, shortIdLength)

const workspaceCount = (count: number): string => `${count} workspace${count === 1 ? "" : "s"}`

const pathErrorMessages = {
  missing: (path: string) => `No directory at ${path}.`,
  not_directory: (path: string) => `${path} is not a directory.`,
  unreadable: (path: string) => `${path} is not readable.`,
} as const

export const renderWorkspaceList = (params: {
  workspaces: ReadonlyArray<Workspace>
  colors: WorkspaceColors
}): string => {
  const { workspaces, colors } = params

  if (workspaces.length === 0) {
    return "No workspaces registered yet."
  }

  const stateColor: Record<Workspace["state"], (text: string) => string> = {
    available: colors.green,
    missing: colors.yellow,
    unavailable: colors.red,
  }

  const header = ["ID", "NAME", "PATH", "STATE"]
  const rows = workspaces.map((workspace) => [
    shortWorkspaceId(workspace.id),
    workspace.name,
    workspace.path,
    workspace.state,
  ])

  const widths = header.map((label, index) =>
    Math.max(label.length, ...rows.map((row) => row[index].length)),
  )

  const renderRow = (cells: readonly string[]): string =>
    cells
      .map((cell, index) => (index === cells.length - 1 ? cell : cell.padEnd(widths[index])))
      .join("  ")

  const lines = [
    colors.dim(renderRow(header)),
    ...rows.map((row, index) => {
      const workspace = workspaces[index]
      const colored = [...row]
      colored[colored.length - 1] = stateColor[workspace.state](workspace.state)
      return renderRow(colored)
    }),
    "",
    colors.dim(workspaceCount(workspaces.length)),
  ]

  return lines.join("\n")
}

export const renderWorkspaceAdded = (params: { workspace: Workspace; created: boolean }): string =>
  params.created
    ? `Added workspace ${params.workspace.name} (${params.workspace.path}) as ${params.workspace.id}.`
    : `Workspace already registered at ${params.workspace.path} (${params.workspace.name}).`

export const renderWorkspaceRemoved = (workspace: Workspace): string =>
  `Removed workspace ${workspace.name} (${workspace.path}).`

export const renderWorkspaceDaemonRunningDeleteGuard = (): string =>
  "The daemon is running and may hold active sessions for this workspace. Pass --force to remove it without closing those sessions."

export const renderWorkspaceDaemonSessionsNotClosed = (): string =>
  "Daemon-held sessions were not closed."

export const renderRegisterWorkspaceError = (params: {
  error: RegisterWorkspaceError
  path: string
}): string => {
  const { error, path } = params

  switch (error.kind) {
    case "path":
      return pathErrorMessages[error.error.kind](path)
    case "invalid_git_url":
      return "The git URL must not start with a dash."
    case "destination_not_empty":
      return `${path} is not empty. Clone into an empty folder.`
    case "clone_failed":
      return `${error.detail}\nThe destination folder was created; partial files may remain.`
    case "duplicate_path":
      return `A workspace is already registered at ${path}.`
    case "not_found":
      return "Workspace not found."
  }
}

export const renderFolderCreatedWithoutWorkspace = (folderPath: string): string =>
  `The folder ${folderPath} was created, but the workspace was not registered.`

export const renderCloneDirectoryError = (params: {
  error: CreateDirectoryError
  parent: string
  destination: string
}): string => {
  const { error, parent, destination } = params

  switch (error.kind) {
    case "path":
      return pathErrorMessages[error.error.kind](parent)
    case "invalid_name":
      return `${destination} is not a valid folder name.`
    case "already_exists":
      return `${destination} already exists. Choose a different name or pass --folder-name.`
    case "permission_denied":
      return `${parent} is not writable.`
  }
}

export const renderWorkspaceReferenceNotFound = (reference: string): string =>
  `No workspace matches "${reference}". Run harold workspace list to see ids, paths, and names.`

export const renderAmbiguousWorkspaceReference = (params: {
  reference: string
  workspaces: ReadonlyArray<Workspace>
}): string => {
  const lines = [
    `More than one workspace is named "${params.reference}":`,
    ...params.workspaces.map(
      (workspace) => `  ${shortWorkspaceId(workspace.id)}  ${workspace.name}  ${workspace.path}`,
    ),
  ]
  return lines.join("\n")
}

export const renderDeleteWorkspaceError = (params: {
  error: DeleteWorkspaceError
  workspace: Workspace
}): string => {
  if (params.error.kind === "active_sessions") {
    return `Live sessions are still bound to ${params.workspace.path}: ${params.error.detail}`
  }
  return `No workspace matches ${params.workspace.id} anymore.`
}
