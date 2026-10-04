import { Workspace } from "contracts/http/workspace"
import { DeleteWorkspaceError } from "core/workspace/ports"
import { WorkspaceRepositoryError } from "core/workspace/errors"

export type WorkspaceColors = Readonly<{
  green: (text: string) => string
  yellow: (text: string) => string
  red: (text: string) => string
  dim: (text: string) => string
}>

const shortIdLength = "ws_".length + 8

const shortWorkspaceId = (id: string): string => id.slice(0, shortIdLength)

const workspaceCount = (count: number): string => `${count} workspace${count === 1 ? "" : "s"}`

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

export const renderWorkspaceAdded = (workspace: Workspace): string =>
  `Added workspace ${workspace.name} (${workspace.path}) as ${workspace.id}.`

export const renderWorkspaceRemoved = (workspace: Workspace): string =>
  `Removed workspace ${workspace.name} (${workspace.path}).`

export const renderWorkspaceDaemonRunningDeleteGuard = (): string =>
  "The daemon is running and may hold active sessions for this workspace. Pass --force to remove it without closing those sessions."

export const renderWorkspaceDaemonSessionsNotClosed = (): string =>
  "Daemon-held sessions were not closed."

const pathErrorMessages: Record<
  Extract<WorkspaceRepositoryError, { kind: "path" }>["error"]["kind"],
  (path: string) => string
> = {
  missing: (path) => `No directory at ${path}.`,
  not_directory: (path) => `${path} is not a directory.`,
  unreadable: (path) => `${path} is not readable.`,
}

export const renderRegisterWorkspaceError = (params: {
  error: WorkspaceRepositoryError
  path: string
}): string => {
  const { error, path } = params

  if (error.kind === "path") {
    return pathErrorMessages[error.error.kind](path)
  }
  if (error.kind === "outside_allowed_root") {
    return "Path is outside the allowed roots. Add its parent directory to allowedRoots in settings.yml first."
  }
  if (error.kind === "duplicate_path") {
    return `A workspace is already registered at ${path}.`
  }
  return "Workspace not found."
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
