import { Command } from "commander"
import pc from "picocolors"
import { ReachabilityFailure } from "core/reachability/models"
import { FetchStatusEndpoint } from "core/reachability/ports"
import { makeNodeFetchStatusEndpoint } from "core/reachability/node.adapters"
import { makeVerifyAdvertisedEndpoint } from "core/reachability/verify.usecase"
import { parseConfig } from "server/config"
import { makeCanonicalizePath } from "server/filesystem/node-adapters"
import {
  makeRuntimeSettingsFileStore,
  RuntimeSettingsFileStore,
  seedDefaultsFromConfig,
  settingsFileName,
} from "server/runtime-settings/file-store"
import {
  makeUpdateRuntimeSettings,
  UpdateRuntimeSettingsDeps,
} from "server/runtime-settings/update.usecase"
import { findConnectRecipe, recipeIds, WhichLookup, WriteLine } from "./connect.recipes"

export type ConnectOptions = Readonly<{
  advertisedUrl?: string
  recipe?: string
  check?: boolean
}>

export type ConnectColors = Readonly<{
  green: (text: string) => string
  red: (text: string) => string
  dim: (text: string) => string
}>

export type ConnectDeps = Readonly<{
  fetchStatus: FetchStatusEndpoint
  makeSettingsStore: (dataDir: string) => RuntimeSettingsFileStore
  which: WhichLookup
  writeLine: WriteLine
  colors: ConnectColors
}>

/**
 * Connect only patches advertisedUrl and advertisedUrlEnabled, so the
 * workspace ports the shared update use case requires are unreachable here.
 * They fail loudly instead of reporting an empty workspace list if that
 * invariant ever breaks.
 */
const listAllWorkspacesGuard: UpdateRuntimeSettingsDeps["listAllWorkspaces"] = () => {
  throw new Error("harold connect does not manage allowed roots")
}

const deleteWorkspaceGuard: UpdateRuntimeSettingsDeps["deleteWorkspace"] = () => {
  throw new Error("harold connect does not manage allowed roots")
}

const renderReachabilityFailure = (error: ReachabilityFailure): string => {
  switch (error.kind) {
    case "invalid_scheme":
      return `invalid advertised URL: ${error.detail}`
    case "unreachable":
      return `unreachable (${error.detail})`
    case "non_2xx":
      return `GET /v1/status returned HTTP ${error.status}, expected 2xx`
    case "invalid_body":
      return `status document is invalid (${error.detail})`
  }
}

const renderChecks = (params: {
  statusUrl: string
  statusCode: number
  version: string
  state: string
  activeSessions: number
}): string[] => [
  `  GET ${params.statusUrl} -> ${params.statusCode}`,
  `  Harold ${params.version} is ${params.state}, ${params.activeSessions} active session(s)`,
]

const settingsFilePath = (dataDir: string): string => `${dataDir}/${settingsFileName}`

export const runConnect = async (params: {
  options: ConnectOptions
  dataDir: string
  deps: ConnectDeps
}): Promise<number> => {
  const { options, dataDir, deps } = params

  if (options.recipe !== undefined) {
    const recipe = findConnectRecipe(options.recipe)
    if (recipe === undefined) {
      deps.writeLine(
        deps.colors.red(
          `Unknown recipe "${options.recipe}". Choose one of: ${recipeIds.join(", ")}.`,
        ),
      )
      return 1
    }

    deps.writeLine(`Recipe: ${recipe.id}`)
    recipe.guide({ which: deps.which, writeLine: deps.writeLine })

    if (options.advertisedUrl === undefined) {
      deps.writeLine("")
      deps.writeLine(
        deps.colors.dim(
          "No advertised URL yet. Re-run with --advertised-url <url> to verify and persist.",
        ),
      )
      return 1
    }
  }

  if (options.advertisedUrl === undefined) {
    deps.writeLine("Nothing to connect to yet.")
    deps.writeLine(`Pass --advertised-url <url>, or start from a recipe: ${recipeIds.join(", ")}.`)
    return 1
  }

  const verifyAdvertisedEndpoint = makeVerifyAdvertisedEndpoint({
    fetchStatus: deps.fetchStatus,
  })
  const result = await verifyAdvertisedEndpoint(options.advertisedUrl)

  if (!result.ok) {
    deps.writeLine(
      deps.colors.red(
        `Could not verify ${options.advertisedUrl}: ${renderReachabilityFailure(result.error)}`,
      ),
    )
    return 1
  }

  deps.writeLine(deps.colors.green(`Verified ${result.value.advertisedUrl}`))
  for (const line of renderChecks({
    statusUrl: result.value.statusUrl,
    statusCode: result.value.httpStatus,
    version: result.value.status.version,
    state: result.value.status.state,
    activeSessions: result.value.status.acp.activeSessions,
  })) {
    deps.writeLine(line)
  }

  if (options.check) {
    deps.writeLine(deps.colors.dim("--check set: verified without persisting."))
    return 0
  }

  const store = deps.makeSettingsStore(dataDir)
  const updateRuntimeSettings = makeUpdateRuntimeSettings({
    getSettings: store.get,
    saveSettings: store.save,
    canonicalizePath: makeCanonicalizePath(),
    listAllWorkspaces: listAllWorkspacesGuard,
    deleteWorkspace: deleteWorkspaceGuard,
  })
  const updated = await updateRuntimeSettings({
    body: { advertisedUrl: options.advertisedUrl, advertisedUrlEnabled: true },
    force: false,
  })

  if (!updated.ok) {
    deps.writeLine(deps.colors.red(`Could not save runtime settings (${updated.error.kind}).`))
    return 1
  }

  deps.writeLine(deps.colors.green(`Saved advertised URL to ${settingsFilePath(dataDir)}`))
  deps.writeLine(`  advertisedUrl: ${updated.value.settings.advertisedUrl}`)
  deps.writeLine(`  advertisedUrlEnabled: ${updated.value.settings.advertisedUrlEnabled}`)
  deps.writeLine("Run `harold pair` next to print a phone-ready QR code for this endpoint.")
  return 0
}

export const makeConnectCommand = (): Command => {
  const command = new Command("connect")
  command.description("verify and persist the advertised endpoint devices pair against")

  command
    .option(
      "-u, --advertised-url <url>",
      "advertised endpoint URL (https, or http on a loopback host)",
    )
    .option("-r, --recipe <name>", `reachability recipe (${recipeIds.join(", ")})`)
    .option("--check", "verify the endpoint without persisting it")

  command.action(async (options: ConnectOptions) => {
    const config = parseConfig(process.env)
    process.exitCode = await runConnect({
      options,
      dataDir: config.dataDir,
      deps: {
        fetchStatus: makeNodeFetchStatusEndpoint(),
        makeSettingsStore: (dataDir) =>
          makeRuntimeSettingsFileStore({
            dataDir,
            seedDefaults: seedDefaultsFromConfig(config),
          }),
        which: (binary) => Bun.which(binary) !== null,
        writeLine: (line) => console.log(line),
        colors: pc,
      },
    })
  })

  return command
}
