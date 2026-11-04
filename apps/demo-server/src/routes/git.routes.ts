import { DemoRouteContext } from "../demo.context"
import { queryValue } from "../demo.context"
import {
  gitChangesFor,
  gitFileDiffFor,
  gitSummaryFor,
  gitWorktreesFor,
  workspaceGitKind,
} from "../fixtures/git"
import { badRequest, jsonResponse, notFound } from "./http"

const gitPath = (context: DemoRouteContext): string | null => {
  const path = queryValue(context.url, "path")
  if (path === undefined) {
    return null
  }
  return workspaceGitKind(path) === null ? null : path
}

export const gitSummaryResponse = (context: DemoRouteContext): Response => {
  const path = gitPath(context)
  if (path === null) {
    return notFound("Git repository not found")
  }
  const kind = workspaceGitKind(path)
  return jsonResponse(gitSummaryFor(kind, path))
}

export const gitWorktreesResponse = (context: DemoRouteContext): Response => {
  const path = gitPath(context)
  if (path === null) {
    return notFound("Git repository not found")
  }
  const kind = workspaceGitKind(path)
  return jsonResponse({ items: gitWorktreesFor(kind, path) })
}

export const gitChangesResponse = (context: DemoRouteContext): Response => {
  const path = gitPath(context)
  if (path === null) {
    return notFound("Git repository not found")
  }

  const scope = queryValue(context.url, "scope")
  if (scope !== "uncommitted" && scope !== "branch") {
    return badRequest("#/scope", "validation.scope.invalid")
  }

  const kind = workspaceGitKind(path)
  return jsonResponse(gitChangesFor(kind, path, scope))
}

export const gitFileResponse = (context: DemoRouteContext): Response => {
  const path = gitPath(context)
  if (path === null) {
    return notFound("Git repository not found")
  }

  const scope = queryValue(context.url, "scope")
  if (scope !== "uncommitted" && scope !== "branch") {
    return badRequest("#/scope", "validation.scope.invalid")
  }

  const file = queryValue(context.url, "file")
  if (file === undefined) {
    return badRequest("#/file", "validation.file.invalid")
  }
  const oldPath = queryValue(context.url, "oldPath") ?? null

  const kind = workspaceGitKind(path)
  return jsonResponse(gitFileDiffFor(kind, file, oldPath, scope))
}
