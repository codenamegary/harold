import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs"
import path from "node:path"
import YAML from "yaml"
import { AdvertisedEndpointEntry, recordAdvertisedEndpoint } from "./advertised.endpoints"

export const advertisedEndpointsFileName = "advertised-endpoints.yml"

export type AdvertisedEndpointsFileStore = Readonly<{
  read: () => ReadonlyArray<AdvertisedEndpointEntry>
  record: (used: AdvertisedEndpointEntry) => ReadonlyArray<AdvertisedEndpointEntry>
}>

type HistoryFile = { endpoints: ReadonlyArray<AdvertisedEndpointEntry> }

const filePathFor = (dataDir: string): string => path.join(dataDir, advertisedEndpointsFileName)

const parseHistory = (raw: string): ReadonlyArray<AdvertisedEndpointEntry> => {
  try {
    const parsed: unknown = YAML.parse(raw)
    if (parsed === null || typeof parsed !== "object") {
      return []
    }
    const endpoints = (parsed as { endpoints?: unknown }).endpoints
    if (!Array.isArray(endpoints)) {
      return []
    }
    return endpoints.filter(
      (item): item is AdvertisedEndpointEntry =>
        typeof item === "object" &&
        item !== null &&
        typeof (item as AdvertisedEndpointEntry).url === "string" &&
        typeof (item as AdvertisedEndpointEntry).lastUsedAt === "string",
    )
  } catch {
    // A corrupt history file is not worth failing over: pairing can re-detect.
    return []
  }
}

/**
 * The advertised-endpoint memory for the pair flow. This is a control-plane
 * artifact the CLI owns, like settings.yml: the daemon never reads it.
 */
export const makeAdvertisedEndpointsFileStore = (options: {
  dataDir: string
}): AdvertisedEndpointsFileStore => {
  const filePath = filePathFor(options.dataDir)

  const read = (): ReadonlyArray<AdvertisedEndpointEntry> => {
    if (!existsSync(filePath)) {
      return []
    }
    return parseHistory(readFileSync(filePath, "utf8"))
  }

  const record = (used: AdvertisedEndpointEntry): ReadonlyArray<AdvertisedEndpointEntry> => {
    const next = recordAdvertisedEndpoint(read(), used)
    const content = YAML.stringify({ endpoints: next } satisfies HistoryFile)
    mkdirSync(options.dataDir, { recursive: true })
    const tempPath = `${filePath}.${process.pid}.tmp`
    writeFileSync(tempPath, content, "utf8")
    renameSync(tempPath, filePath)
    return next
  }

  return { read, record }
}
