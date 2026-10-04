import { Command } from "commander"
import pc from "picocolors"
import {
  CreatePairingCodeBody,
  PairingEndpointChoice,
  PairingEndpointChoiceSchema,
} from "contracts/http/pairing-code"
import { formatPairingQrUri } from "contracts/pairing/qr-uri"
import { CreatePairingCodeResult } from "core/device/create.pairing.code.usecase"
import { DeviceError } from "core/device/errors"
import { GetPairingCodeById } from "core/device/ports"
import { parseConfig } from "server/config"
import { AgentDatabase, openDatabase } from "server/database"
import { assembleDeviceSlice, DeviceSlice } from "server/device"
import { makeRuntimeSettingsFileStore, seedDefaultsFromConfig } from "server/runtime-settings"
import { renderTerminalQr, RenderQrText } from "./pair.qr"
import { PairingColors, renderPairingJson, renderPairingSummary } from "./pair.render"
import { waitForPairingClaim } from "./pair.wait"

type PairCommandContext = Readonly<{
  slice: DeviceSlice
  database: AgentDatabase
}>

const openPairCommandContext = (): PairCommandContext => {
  const config = parseConfig(process.env)
  const database = openDatabase({ dataDir: config.dataDir })
  const runtimeSettingsStore = makeRuntimeSettingsFileStore({
    dataDir: config.dataDir,
    seedDefaults: seedDefaultsFromConfig(config),
  })
  const slice = assembleDeviceSlice({
    database,
    loopbackEndpoint: `http://${config.host}:${config.port}`,
    getAdvertisedEndpointSettings: () => {
      const settings = runtimeSettingsStore.get()
      return {
        advertisedUrl: settings.advertisedUrl,
        advertisedUrlEnabled: settings.advertisedUrlEnabled,
      }
    },
  })

  return { slice, database }
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
  advertised_endpoint_unavailable:
    "Advertised endpoint is not available. Set an advertisedUrl in settings.yml or omit --endpoint.",
}

const renderDeviceError = (error: DeviceError): string => pairingErrorMessages[error.kind]

type ParseEndpointResult =
  | { ok: true; value: PairingEndpointChoice | undefined }
  | { ok: false; message: string }

const parseEndpointChoice = (raw: string | undefined): ParseEndpointResult => {
  if (raw === undefined) {
    return { ok: true, value: undefined }
  }

  const parsed = PairingEndpointChoiceSchema.safeParse(raw)
  if (!parsed.success) {
    return { ok: false, message: '--endpoint must be "loopback" or "advertised".' }
  }

  return { ok: true, value: parsed.data }
}

export type PairActionOptions = Readonly<{
  endpoint: PairingEndpointChoice | undefined
  wait: boolean
  json: boolean
}>

export type PairActionDeps = Readonly<{
  createPairingCode: (body?: CreatePairingCodeBody) => Promise<CreatePairingCodeResult>
  getPairingCodeById: GetPairingCodeById
  renderTerminalQr: RenderQrText
  colors: PairingColors
  writeOut: (text: string) => void
  writeErr: (text: string) => void
  now: () => Date
  sleep: (ms: number) => Promise<void>
}>

/**
 * Creates a pairing code, renders it (human summary + terminal QR, or JSON),
 * then optionally waits for a device to claim it. The transport, clock, and
 * renderers are injected so the command stays testable without a live daemon.
 */
export const executePair = async (
  deps: PairActionDeps,
  options: PairActionOptions,
): Promise<number> => {
  const created = await deps.createPairingCode(
    options.endpoint === undefined ? {} : { endpoint: options.endpoint },
  )

  if (!created.ok) {
    if (options.json) {
      deps.writeErr(JSON.stringify({ state: created.error.kind }))
    } else {
      deps.writeErr(renderDeviceError(created.error))
    }
    return 1
  }

  const pairing = created.value
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
    deps.writeOut(await deps.renderTerminalQr(qrUri))
    deps.writeOut("")
  }

  if (!options.wait) {
    return 0
  }

  if (!options.json) {
    deps.writeOut("Waiting for a device to scan...")
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

export const makePairCommand = (): Command => {
  const command = new Command("pair")
  command.description("pair a device by scanning a QR code")
  command
    .option("--endpoint <endpoint>", "pairing endpoint (loopback or advertised)")
    .option("--no-wait", "print the code and exit without waiting for a device")
    .option("--json", "emit newline-delimited JSON (one object per line)")

  command.action(async (options: { endpoint?: string; wait: boolean; json: boolean }) => {
    await withPairCommandContext(async (context) => {
      const endpoint = parseEndpointChoice(options.endpoint)
      if (!endpoint.ok) {
        console.error(pc.red(endpoint.message))
        process.exitCode = 1
        return
      }

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
        { endpoint: endpoint.value, wait: options.wait, json: options.json },
      )

      if (exitCode !== 0) {
        process.exitCode = exitCode
      }
    })
  })

  return command
}
