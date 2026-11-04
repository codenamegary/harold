import { randomUUID } from "node:crypto"
import { DemoRouteContext } from "../demo.context"
import { queryValue } from "../demo.context"
import { DemoWorkspace } from "../demo.state"
import {
  badRequest,
  conflict,
  jsonResponse,
  noContentResponse,
  notFound,
  readJsonObject,
  readString,
} from "./http"

const workspaceState = (value: string | undefined): DemoWorkspace["state"] | undefined => {
  if (value === undefined) {
    return undefined
  }
  if (value === "available" || value === "missing" || value === "unavailable") {
    return value
  }
  return undefined
}

const wireWorkspace = (workspace: DemoWorkspace) => ({
  id: workspace.id,
  name: workspace.name,
  path: workspace.path,
  state: workspace.state,
  createdAt: workspace.createdAt,
  lastUsedAt: workspace.lastUsedAt,
})

const basename = (path: string): string => {
  const trimmed = path.endsWith("/") ? path.slice(0, -1) : path
  const index = trimmed.lastIndexOf("/")
  return index >= 0 ? trimmed.slice(index + 1) : trimmed
}

export const listWorkspacesResponse = (context: DemoRouteContext): Response => {
  const device = context.store.getDevice(context.deviceId)
  if (device === undefined) {
    return notFound("Device not found")
  }

  const limitRaw = queryValue(context.url, "limit") ?? "100"
  const limit = Number(limitRaw)
  if (!Number.isInteger(limit) || limit <= 0 || limit > 200) {
    return badRequest("#/limit", "validation.limit.invalid")
  }

  const stateRaw = queryValue(context.url, "state")
  const state = workspaceState(stateRaw)
  if (stateRaw !== undefined && state === undefined) {
    return badRequest("#/state", "validation.state.invalid")
  }

  const search = queryValue(context.url, "q")?.toLowerCase()
  const rows = [...device.workspaces.values()]
    .filter((workspace) => state === undefined || workspace.state === state)
    .filter((workspace) =>
      search === undefined
        ? true
        : workspace.name.toLowerCase().includes(search) ||
          workspace.path.toLowerCase().includes(search),
    )
    .slice(0, limit)

  return jsonResponse({
    items: rows.map(wireWorkspace),
    page: {
      limit,
      count: rows.length,
    },
  })
}

export const createWorkspaceResponse = async (context: DemoRouteContext): Promise<Response> => {
  const device = context.store.getDevice(context.deviceId)
  if (device === undefined) {
    return notFound("Device not found")
  }

  const body = await readJsonObject(context.request)
  if (body === null) {
    return badRequest("#", "validation.body.invalid")
  }

  const source = body.source
  if (source !== "folder" && source !== "git") {
    return badRequest("#/source", "validation.source.invalid")
  }

  const path = readString(body, "path", 1, 4_096)
  if (path === null) {
    return badRequest("#/path", "validation.path.invalid")
  }

  const nameValue = body.name
  if (
    nameValue !== undefined &&
    (typeof nameValue !== "string" || nameValue.length < 1 || nameValue.length > 80)
  ) {
    return badRequest("#/name", "validation.name.invalid")
  }
  const name = typeof nameValue === "string" ? nameValue : basename(path)
  if (name.length === 0) {
    return badRequest("#/name", "validation.name.invalid")
  }

  if (source === "git" && readString(body, "url", 1, 4_096) === null) {
    return badRequest("#/url", "validation.url.invalid")
  }
  if (source === "folder" && body.url !== undefined) {
    return badRequest("#/url", "validation.url.unexpected")
  }

  if ([...device.workspaces.values()].some((workspace) => workspace.path === path)) {
    return conflict("A workspace already uses that path")
  }

  const nowIso = new Date(context.store.now()).toISOString()
  const workspace: DemoWorkspace = {
    id: `ws_demo_${randomUUID()}`,
    name,
    path,
    state: "available",
    branch: "main",
    createdAt: nowIso,
    lastUsedAt: nowIso,
  }
  device.workspaces.set(workspace.id, workspace)
  return jsonResponse(wireWorkspace(workspace), 201)
}

export const getWorkspaceResponse = (context: DemoRouteContext, workspaceId: string): Response => {
  const device = context.store.getDevice(context.deviceId)
  const workspace = device?.workspaces.get(workspaceId)
  return workspace === undefined
    ? notFound("Workspace not found")
    : jsonResponse(wireWorkspace(workspace))
}

export const renameWorkspaceResponse = async (
  context: DemoRouteContext,
  workspaceId: string,
): Promise<Response> => {
  const device = context.store.getDevice(context.deviceId)
  if (device === undefined) {
    return notFound("Device not found")
  }
  const workspace = device.workspaces.get(workspaceId)
  if (workspace === undefined) {
    return notFound("Workspace not found")
  }

  const body = await readJsonObject(context.request)
  const name = body === null ? null : readString(body, "name", 1, 80)
  if (name === null) {
    return badRequest("#/name", "validation.name.invalid")
  }

  workspace.name = name
  workspace.lastUsedAt = new Date(context.store.now()).toISOString()
  return jsonResponse(wireWorkspace(workspace))
}

export const deleteWorkspaceResponse = (
  context: DemoRouteContext,
  workspaceId: string,
): Response => {
  const device = context.store.getDevice(context.deviceId)
  if (device === undefined) {
    return notFound("Device not found")
  }
  if (!device.workspaces.has(workspaceId)) {
    return notFound("Workspace not found")
  }

  for (const session of context.store.listSessions(context.deviceId)) {
    if (session.workspaceId === workspaceId) {
      context.store.deleteSession(context.deviceId, session.id)
    }
  }
  device.workspaces.delete(workspaceId)
  return noContentResponse()
}
