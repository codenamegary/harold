import { select as clackSelect, text as clackText, isCancel as clackIsCancel } from "@clack/prompts"
import { Command } from "commander"
import pc from "picocolors"
import { CreatePairingCodeResponse } from "contracts/http/pairing-code"
import { formatPairingQrUri } from "contracts/pairing/qr-uri"
import { CreatePairingCodeResult } from "core/device/create.pairing.code.usecase"
import { DeviceError } from "core/device/errors"
import { GetPairingCodeById } from "core/device/ports"
import { AdvertisedEndpointEntry } from "core/network/advertised.endpoints"
import { makeAdvertisedEndpointsFileStore } from "core/network/advertised.endpoints.node.adapters"
import { detectUsableIpv4AddressEntries } from "core/network/lan.address"
import { VerifyAdvertisedEndpoint } from "core/reachability/verify.usecase"
import { FetchStatusEndpoint } from "core/reachability/ports"
import { makeNodeFetchStatusEndpoint } from "core/reachability/node.adapters"
import { makeVerifyAdvertisedEndpoint } from "core/reachability/verify.usecase"
import { parseConfig } from "server/config"
import { AgentDatabase, openDatabase } from "server/database"
import { assembleDeviceSlice, DeviceSlice } from "server/device"
import { renderTerminalQr, RenderQrText } from "./pair.qr"
import { PairingColors, renderPairingJson, renderPairingSummary } from "./pair.render"
import { waitForPairingClaim } from "./pair.wait"
import { resolvePairingEndpoint } from "./pair.endpoint"

type PairCommandContext = Readonly<{
  slice: DeviceSlice
  database: AgentDatabase
  readHistory: () => ReadonlyArray<AdvertisedEndpointEntry>
  recordHistory: (used: AdvertisedEndpointEntry) => void
  verifyEndpoint: VerifyAdvertisedEndpoint
}>

const openPairCommandContext = (): PairCommandContext => {
  const config = parseConfig(process.env)
  const database = openDatabase({ dataDir: config.dataDir })
  const historyStore = makeAdvertisedEndpointsFileStore({ dataDir: config.dataDir })
  const fetchStatus: FetchStatusEndpoint = makeNodeFetchStatusEndpoint()

  return {
    slice: assembleDeviceSlice({ database }),
    database,
    readHistory: historyStore.read,
    recordHistory: (used) => {
      historyStore.record(used)
    },
    verifyEndpoint: makeVerifyAdvertisedEndpoint({ fetchStatus }),
  }
}

const withPairCommandContext = async (
  run: (context: PairCommandContext) => Promise<void> | void,
): Promise<void> => {
  const context = openPairCommandContext()
  try {
    await run(context)
  } finally {
    context.database.close()
  }
}

const pairingErrorMessages: Record<DeviceError["kind"], string> = {
  pairing_code_not_found: "Pairing code was removed before a device claimed it.",
  pairing_code_claimed: "Pairing code was already claimed.",
  pairing_code_expired: "Pairing code expired before a device claimed it.",
  pairing_code_revoked: "Pairing code was revoked before a device claimed it.",
  pairing_code_race: "Pairing code was claimed by another device.",
  device_not_found: "Device not found.",
}

const renderDeviceError = (error: DeviceError): string => pairingErrorMessages[error.kind]

export type PairRenderMode = "qr" | "manual"

export type PairActionOptions = Readonly<{
  endpoint: string
  mode: PairRenderMode
  wait: boolean
  json: boolean
}>

export type PairActionDeps = Readonly<{
  createPairingCode: (endpoint: string) => Promise<CreatePairingCodeResult>
  getPairingCodeById: GetPairingCodeById
  renderTerminalQr: RenderQrText
  colors: PairingColors
  writeOut: (text: string) => void
  writeErr: (text: string) => void
  now: () => Date
  sleep: (ms: number) => Promise<void>
}>

/**
 * Renders a pairing code against the already-resolved endpoint (human
 * summary + terminal QR, or JSON), then optionally waits for a device to
 * claim it. Endpoint selection lives in the command action; the transport,
 * clock, and renderers are injected so the command stays testable without a
 * live daemon.
 */
export const executePair = async (
  deps: PairActionDeps,
  options: PairActionOptions,
): Promise<number> => {
  const created = await deps.createPairingCode(options.endpoint)

  if (!created.ok) {
    if (options.json) {
      deps.writeErr(JSON.stringify({ state: created.error.kind }))
    } else {
      deps.writeErr(renderDeviceError(created.error))
    }
    return 1
  }

  const pairing: CreatePairingCodeResponse = created.value
  const qrUri = formatPairingQrUri({ endpoint: pairing.endpoint, code: pairing.code })

  if (options.json) {
    deps.writeOut(renderPairingJson({ pairing, qrUri }))
  } else {
    deps.writeOut(
      renderPairingSummary({
        code: pairing.code,
        endpoint: pairing.endpoint,
        expiresAt: pairing.expiresAt,
        colors: deps.colors,
      }),
    )
    deps.writeOut("")
    if (options.mode === "qr") {
      deps.writeOut(await deps.renderTerminalQr(qrUri))
      deps.writeOut("")
    } else {
      deps.writeOut(
        deps.colors.dim(
          "Manual pairing: choose Enter a code in the app, type this endpoint, then the code.",
        ),
      )
      deps.writeOut("")
    }
  }

  if (!options.wait) {
    return 0
  }

  if (!options.json) {
    deps.writeOut("Waiting for a device to claim...")
  }

  const wait = waitForPairingClaim({
    getPairingCodeById: deps.getPairingCodeById,
    now: deps.now,
    sleep: deps.sleep,
  })
  const result = await wait(pairing.id)

  if (result.ok) {
    if (options.json) {
      deps.writeOut(JSON.stringify({ state: "claimed", pairingCodeId: result.value.pairingCodeId }))
    } else {
      deps.writeOut("Device paired.")
    }
    return 0
  }

  if (options.json) {
    deps.writeErr(JSON.stringify({ state: result.error.kind, pairingCodeId: pairing.id }))
  } else {
    deps.writeErr(renderDeviceError(result.error))
  }
  return 1
}

const chooseRenderMode = async (options: {
  qr?: boolean
  manual?: boolean
  json: boolean
}): Promise<PairRenderMode> => {
  if (options.json) {
    return "qr"
  }
  if (options.manual) {
    return "manual"
  }
  if (options.qr) {
    return "qr"
  }

  if (!process.stdout.isTTY) {
    return "qr"
  }

  const selected = await clackSelect<"qr" | "manual">({
    message: "How will the device pair?",
    options: [
      { value: "qr" as const, label: "Scan the QR code" },
      { value: "manual" as const, label: "Enter the code manually" },
    ],
    initialValue: "qr" as const,
  })
  if (clackIsCancel(selected)) {
    return "qr"
  }
  return selected
}

export const makePairCommand = (): Command => {
  const command = new Command("pair")
  command.description("pair a device with a QR code or a manual code")
  command
    .option(
      "--url <endpoint>",
      "endpoint to advertise (default: detection with remembered history)",
    )
    .option("--qr", "render the QR code without prompting")
    .option("--manual", "print the endpoint and code for manual entry, without prompting")
    .option("--no-wait", "print the code and exit without waiting for a device")
    .option("--json", "emit newline-delimited JSON (one object per line)")

  command.action(
    async (options: {
      url?: string
      qr?: boolean
      manual?: boolean
      wait: boolean
      json: boolean
    }) => {
      await withPairCommandContext(async (context) => {
        const choice = await resolvePairingEndpoint({
          explicitUrl: options.url,
          readHistory: context.readHistory,
          listLanAddresses: detectUsableIpv4AddressEntries,
          port: parseConfig(process.env).port,
          verifyEndpoint: context.verifyEndpoint,
          isInteractive: process.stdout.isTTY === true,
          writeLine: (line) => console.log(line),
          ...(process.stdout.isTTY
            ? {
                prompts: {
                  select: async (message, selectOptions, initialValue) => {
                    const answer = await clackSelect({
                      message,
                      options: selectOptions.map((option) => ({
                        value: option.value,
                        label: option.label,
                        hint: option.hint,
                      })),
                      initialValue,
                    })
                    return answer
                  },
                  text: async (message, placeholder) => {
                    return clackText({ message, placeholder })
                  },
                  isCancel: (value) => clackIsCancel(value),
                },
              }
            : {}),
        })

        if (!choice.ok) {
          console.error(pc.red(choice.message))
          process.exitCode = 1
          return
        }

        context.recordHistory({
          url: choice.url,
          source: choice.source,
          lastUsedAt: new Date().toISOString(),
        })

        const mode = await chooseRenderMode({
          qr: options.qr,
          manual: options.manual,
          json: options.json,
        })

        const exitCode = await executePair(
          {
            createPairingCode: context.slice.createPairingCode,
            getPairingCodeById: context.slice.getPairingCodeById,
            renderTerminalQr,
            colors: { bold: pc.bold, dim: pc.dim },
            writeOut: (text) => console.log(text),
            writeErr: (text) => console.error(text),
            now: () => new Date(),
            sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
          },
          { endpoint: choice.url, mode, wait: options.wait, json: options.json },
        )

        if (exitCode !== 0) {
          process.exitCode = exitCode
        }
      })
    },
  )

  return command
}
