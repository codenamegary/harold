import { DemoRouteContext } from "../demo.context"
import { queryValue } from "../demo.context"
import { DEMO_HOME } from "../fixtures/workspaces"
import {
  baseDirectoryChildren,
  isValidDirectoryName,
  parentDirectoryOf,
  DemoDirectory,
} from "../fixtures/filesystem"
import { badRequest, conflict, jsonResponse, readJsonObject, readString } from "./http"

const directoryChildren = (
  context: DemoRouteContext,
  path: string,
): ReadonlyArray<DemoDirectory> => {
  const device = context.store.getDevice(context.deviceId)
  const created: DemoDirectory[] = []
  if (device !== undefined) {
    for (const createdPath of device.extraDirectories) {
      if (parentDirectoryOf(createdPath) !== path) {
        continue
      }
      const lastSlash = createdPath.lastIndexOf("/")
      created.push({ name: createdPath.slice(lastSlash + 1), path: createdPath })
    }
  }

  const rows = [...baseDirectoryChildren(path), ...created].sort((left, right) =>
    left.name.localeCompare(right.name),
  )
  return rows
}

export const listFilesystemDirectoriesResponse = (context: DemoRouteContext): Response => {
  const device = context.store.getDevice(context.deviceId)
  if (device === undefined) {
    return jsonResponse({ path: DEMO_HOME, parent: null, items: [] })
  }

  const root = queryValue(context.url, "root") ?? DEMO_HOME
  if (!root.startsWith("/")) {
    return badRequest("#/root", "validation.root.invalid")
  }

  return jsonResponse({
    path: root,
    parent: parentDirectoryOf(root),
    items: directoryChildren(context, root),
  })
}

export const createFilesystemDirectoryResponse = async (
  context: DemoRouteContext,
): Promise<Response> => {
  const device = context.store.getDevice(context.deviceId)
  if (device === undefined) {
    return badRequest("#", "validation.body.invalid")
  }

  const body = await readJsonObject(context.request)
  if (body === null) {
    return badRequest("#", "validation.body.invalid")
  }

  const parent = readString(body, "parent", 1, 4_096)
  if (parent === null || !parent.startsWith("/")) {
    return badRequest("#/parent", "validation.parent.invalid")
  }

  const name = readString(body, "name", 1, 120)
  if (name === null || !isValidDirectoryName(name)) {
    return badRequest("#/name", "validation.name.invalid")
  }

  const path = parent.endsWith("/") ? `${parent}${name}` : `${parent}/${name}`
  const exists =
    baseDirectoryChildren(parent).some((directory) => directory.name === name) ||
    device.extraDirectories.has(path)
  if (exists) {
    return conflict("That folder already exists")
  }

  device.extraDirectories.add(path)
  return jsonResponse({ name, path }, 201)
}
