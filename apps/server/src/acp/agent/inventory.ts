import { knownCapabilityPaths } from "./capabilities"
import { AgentMethodDeclarationReader } from "./method.declarations"
import { AgentMethodName, CapabilityPath } from "./models"

export type CapabilityAgentInfo = {
  name: string
  version: string
  title?: string
}

export type CapabilityInventoryEntry = {
  path: string
  advertised: boolean
  value?: unknown
  known: boolean
  requiredBy: ReadonlyArray<AgentMethodName>
}

export type CapabilityInventory = {
  agentInfo: CapabilityAgentInfo | null
  entries: ReadonlyArray<CapabilityInventoryEntry>
  entry: (path: string) => CapabilityInventoryEntry | undefined
}

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value)

const readAtPath = (
  root: unknown,
  path: string,
): { present: true; value: unknown } | { present: false } => {
  const parts = path.split(".")
  let current: unknown = root

  for (const part of parts) {
    if (!isPlainObject(current) || !(part in current)) {
      return { present: false }
    }
    current = current[part]
  }

  return { present: true, value: current }
}

const collectAdvertisedLeaves = (
  node: unknown,
  prefix: string,
  into: Map<string, unknown>,
): void => {
  if (!isPlainObject(node)) {
    if (prefix !== "") {
      into.set(prefix, node)
    }
    return
  }

  const keys = Object.keys(node)
  if (keys.length === 0) {
    if (prefix !== "") {
      into.set(prefix, node)
    }
    return
  }

  for (const key of keys) {
    const childPath = prefix === "" ? key : `${prefix}.${key}`
    const child = node[key]

    if (key === "_meta") {
      collectAdvertisedLeaves(child, childPath, into)
      continue
    }

    if (isPlainObject(child) && Object.keys(child).length > 0) {
      collectAdvertisedLeaves(child, childPath, into)
      continue
    }

    into.set(childPath, child)
  }
}

const parseAgentInfo = (initializeResult: unknown): CapabilityAgentInfo | null => {
  const value = initializeResult as {
    agentInfo?: {
      name?: unknown
      version?: unknown
      title?: unknown
    }
  }

  if (
    typeof value.agentInfo?.name !== "string" ||
    typeof value.agentInfo?.version !== "string"
  ) {
    return null
  }

  return {
    name: value.agentInfo.name,
    version: value.agentInfo.version,
    ...(typeof value.agentInfo.title === "string"
      ? { title: value.agentInfo.title }
      : {}),
  }
}

const readAgentCapabilitiesRoot = (initializeResult: unknown): unknown => {
  const value = initializeResult as { agentCapabilities?: unknown }
  return value.agentCapabilities
}

const requiredByFor = (
  path: CapabilityPath,
  declarations: AgentMethodDeclarationReader,
): ReadonlyArray<AgentMethodName> => declarations.methodsRequiring(path)

export const buildCapabilityInventory = (input: {
  initializeResult: unknown
  declarations: AgentMethodDeclarationReader
}): CapabilityInventory => {
  const root = readAgentCapabilitiesRoot(input.initializeResult)
  const leaves = new Map<string, unknown>()
  if (root !== undefined) {
    collectAdvertisedLeaves(root, "", leaves)
  }

  const entriesByPath = new Map<string, CapabilityInventoryEntry>()

  for (const path of knownCapabilityPaths) {
    const atPath = readAtPath(root, path)
    entriesByPath.set(path, {
      path,
      advertised: atPath.present,
      ...(atPath.present ? { value: atPath.value } : {}),
      known: true,
      requiredBy: requiredByFor(path, input.declarations),
    })
  }

  const unknownLeafPaths = [...leaves.keys()]
    .filter((path) => !entriesByPath.has(path))
    .sort()

  for (const path of unknownLeafPaths) {
    entriesByPath.set(path, {
      path,
      advertised: true,
      value: leaves.get(path),
      known: false,
      requiredBy: requiredByFor(path, input.declarations),
    })
  }

  const entries = [...entriesByPath.values()]
  const byPath = new Map(entries.map((entry) => [entry.path, entry]))

  return {
    agentInfo: parseAgentInfo(input.initializeResult),
    entries,
    entry: (path) => byPath.get(path),
  }
}

export const inventoryEntry = (
  inventory: CapabilityInventory | null | undefined,
  path: string,
): CapabilityInventoryEntry | undefined => inventory?.entry(path)

export const inventoryAdvertisesResumable = (
  inventory: CapabilityInventory | null | undefined,
): boolean => inventoryEntry(inventory, "loadSession")?.value === true

export const inventoryAdvertisesSessionClose = (
  inventory: CapabilityInventory | null | undefined,
): boolean => {
  const found = inventoryEntry(inventory, "sessionCapabilities.close")
  return found?.advertised === true && found.value !== false
}

export const inventoryAdvertisesSessionList = (
  inventory: CapabilityInventory | null | undefined,
): boolean =>
  inventoryEntry(inventory, "sessionCapabilities.list")?.advertised === true
