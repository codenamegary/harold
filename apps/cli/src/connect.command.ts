import { Command } from "commander"
import pc from "picocolors"
import {
  AdvertisedUrlSchema,
  BindHost,
  isIpv4Address,
  isIpv6Address,
  isLoopbackHostname,
} from "contracts/http/runtime-settings"
import { ReachabilityFailure, VerifiedAdvertisedEndpoint } from "core/reachability/models"
import { FetchStatusEndpoint } from "core/reachability/ports"
import { makeNodeFetchStatusEndpoint } from "core/reachability/node.adapters"
import { makeVerifyAdvertisedEndpoint } from "core/reachability/verify.usecase"
import { localApiUrl } from "core/status/summary.models"
import { parseConfig } from "server/config"
import {
  makeRuntimeSettingsFileStore,
  RuntimeSettingsFileStore,
  seedDefaultsFromConfig,
  settingsFileName,
} from "server/runtime-settings/file-store"
import { makeUpdateRuntimeSettings } from "server/runtime-settings/update.usecase"
import { detectLanAddress } from "./lan.address"
import { findConnectRecipe, recipeIds, WhichLookup, WriteLine } from "./connect.recipes"

export type ConnectOptions = Readonly<{
  advertisedUrl?: string
  recipe?: string
  check?: boolean
  lan?: boolean | string
}>

export type ConnectColors = Readonly<{
  green: (text: string) => string
  red: (text: string) => string
  yellow: (text: string) => string
  dim: (text: string) => string
}>

export type ConnectDeps = Readonly<{
  fetchStatus: FetchStatusEndpoint
  makeSettingsStore: (dataDir: string) => RuntimeSettingsFileStore
  which: WhichLookup
  writeLine: WriteLine
  colors: ConnectColors
  port: number
  localUrl: string
  detectLanAddress: () => string | null
}>

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

const hostForUrl = (host: string): string =>
  host.includes(":") && !host.startsWith("[") ? `[${host}]` : host

const bindHostForLanAddress = (address: string): BindHost =>
  isIpv4Address(address) || isIpv6Address(address) ? address : "0.0.0.0"

const isCleartextLanUrl = (url: string): boolean => {
  if (!url.startsWith("http://")) {
    return false
  }
  const hostname = new URL(url).hostname.replace(/^\[|\]$/g, "")
  return !isLoopbackHostname(hostname)
}

export const runConnect = async (params: {
  options: ConnectOptions
  dataDir: string
  deps: ConnectDeps
}): Promise<number> => {
  const { options, dataDir, deps } = params

  if (options.lan !== undefined && options.advertisedUrl !== undefined) {
    deps.writeLine(deps.colors.red("Choose either --lan or --advertised-url, not both."))
    return 1
  }

  if (options.lan !== undefined && options.recipe !== undefined) {
    deps.writeLine(deps.colors.red("Choose either --lan or --recipe, not both."))
    return 1
  }

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
    recipe.guide({ detection: recipe.detect({ which: deps.which }), writeLine: deps.writeLine })

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

  const isLan = options.lan !== undefined
  let advertisedUrl: string
  let bindHost: BindHost | undefined

  if (isLan) {
    const explicit = typeof options.lan === "string" && options.lan.trim() !== ""
    const requested = explicit ? options.lan.trim() : deps.detectLanAddress()

    if (requested === null || requested === "") {
      deps.writeLine(
        deps.colors.red("Could not detect a LAN address. Pass --lan <address> to choose one."),
      )
      return 1
    }

    advertisedUrl = `http://${hostForUrl(requested)}:${deps.port}`
    const validated = AdvertisedUrlSchema.safeParse(advertisedUrl)
    if (!validated.success) {
      deps.writeLine(
        deps.colors.red(
          `Could not use ${requested}: expected a private-network address, not a public or unspecified one.`,
        ),
      )
      return 1
    }

    const hostname = new URL(advertisedUrl).hostname.replace(/^\[|\]$/g, "")
    if (isLoopbackHostname(hostname)) {
      deps.writeLine(
        deps.colors.red(
          `Could not use ${requested}: --lan needs an address your phone can reach, not loopback.`,
        ),
      )
      return 1
    }

    bindHost = explicit ? bindHostForLanAddress(requested) : "0.0.0.0"
  } else {
    if (options.advertisedUrl === undefined) {
      deps.writeLine("Nothing to connect to yet.")
      deps.writeLine(
        `Pass --advertised-url <url>, --lan, or start from a recipe: ${recipeIds.join(", ")}.`,
      )
      return 1
    }

    advertisedUrl = options.advertisedUrl
  }

  const verifyAdvertisedEndpoint = makeVerifyAdvertisedEndpoint({
    fetchStatus: deps.fetchStatus,
  })

  const verify = async (url: string) => {
    const result = await verifyAdvertisedEndpoint(url)
    if (!result.ok) {
      deps.writeLine(
        deps.colors.red(`Could not verify ${url}: ${renderReachabilityFailure(result.error)}`),
      )
    }
    return result
  }

  const direct = await verify(advertisedUrl)
  let verified: VerifiedAdvertisedEndpoint
  let restartAfterSave = false

  if (direct.ok) {
    verified = direct.value
  } else if (isLan && !options.check) {
    const fallback = await verify(deps.localUrl)
    if (!fallback.ok) {
      return 1
    }
    verified = fallback.value
    restartAfterSave = true
  } else {
    return 1
  }

  if (verified.advertisedUrl === advertisedUrl) {
    deps.writeLine(deps.colors.green(`Verified ${advertisedUrl}`))
  } else {
    deps.writeLine(deps.colors.green(`Harold is reachable on ${verified.advertisedUrl}`))
    deps.writeLine(
      deps.colors.dim(`The LAN endpoint ${advertisedUrl} will work after the bind change.`),
    )
  }

  for (const line of renderChecks({
    statusUrl: verified.statusUrl,
    statusCode: verified.httpStatus,
    version: verified.status.version,
    state: verified.status.state,
    activeSessions: verified.status.acp.activeSessions,
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
  })
  const updated = await updateRuntimeSettings({
    body: {
      advertisedUrl,
      advertisedUrlEnabled: true,
      ...(bindHost === undefined ? {} : { bindHost }),
    },
  })

  deps.writeLine(
    deps.colors.green(
      `Saved ${isLan ? "LAN endpoint" : "advertised URL"} to ${settingsFilePath(dataDir)}`,
    ),
  )
  deps.writeLine(`  advertisedUrl: ${updated.settings.advertisedUrl}`)
  if (bindHost !== undefined) {
    deps.writeLine(`  bindHost: ${updated.settings.bindHost}`)
  }
  deps.writeLine(`  advertisedUrlEnabled: ${updated.settings.advertisedUrlEnabled}`)

  if (isCleartextLanUrl(advertisedUrl)) {
    deps.writeLine(
      deps.colors.yellow(
        "Warning: this endpoint is unencrypted HTTP. Use it only on a trusted network.",
      ),
    )
  }

  if (isLan && restartAfterSave) {
    deps.writeLine("Restart Harold to apply the bind change:")
    deps.writeLine("  harold stop && harold start")
    deps.writeLine(
      `If ${advertisedUrl} still fails, allow port ${deps.port} through the host firewall.`,
    )
  }

  deps.writeLine("Run `harold pair` next to print a phone-ready QR code for this endpoint.")
  return 0
}

export const makeConnectCommand = (): Command => {
  const command = new Command("connect")
  command.description("verify and persist the advertised endpoint devices pair against")

  command
    .option(
      "-u, --advertised-url <url>",
      "advertised endpoint URL (https, or http on a loopback or private-network host)",
    )
    .option("-r, --recipe <name>", `reachability recipe (${recipeIds.join(", ")})`)
    .option("--lan [address]", "serve a trusted LAN over http: bind the address and advertise it")
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
        port: config.port,
        localUrl: localApiUrl({ host: config.host, port: config.port }),
        detectLanAddress,
      },
    })
  })

  return command
}
