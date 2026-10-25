import { confirm as clackConfirm, isCancel as clackIsCancel } from "@clack/prompts"
import { Command } from "commander"
import pc from "picocolors"
import { Device } from "contracts/http/device"
import { localApiUrl } from "core/status/summary.models"
import { parseConfig } from "server/config"
import { AgentDatabase, openDatabase } from "server/database"
import { assembleDeviceSlice, DeviceSlice } from "server/device"
import { makeRuntimeSettingsFileStore, seedDefaultsFromConfig } from "server/runtime-settings"
import { makeDeviceNameMatcher } from "./device.name.pattern"
import {
  RemoveDeviceTarget,
  renderAmbiguousDeviceId,
  renderDeviceList,
  renderDeviceNameNoMatch,
  renderDeviceRemoveError,
  renderDeviceRemoved,
  renderRemoveDevicesConfirmation,
} from "./device.render"

type DeviceCommandContext = Readonly<{
  slice: DeviceSlice
  database: AgentDatabase
}>

export type DeviceCommandDeps = Readonly<{
  confirm: (message: string) => Promise<boolean>
}>

const defaultDeviceCommandDeps: DeviceCommandDeps = {
  confirm: async (message) => {
    const answer = await clackConfirm({ message, initialValue: false })
    return clackIsCancel(answer) ? false : answer
  },
}

const openDeviceCommandContext = (): DeviceCommandContext => {
  const config = parseConfig(process.env)
  const database = openDatabase({ dataDir: config.dataDir })
  const runtimeSettingsStore = makeRuntimeSettingsFileStore({
    dataDir: config.dataDir,
    seedDefaults: seedDefaultsFromConfig(config),
  })
  const slice = assembleDeviceSlice({
    database,
    loopbackEndpoint: localApiUrl({ host: config.host, port: config.port }),
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

const withDeviceCommandContext = async (
  run: (context: DeviceCommandContext) => Promise<void> | void,
): Promise<void> => {
  const context = openDeviceCommandContext()
  try {
    await run(context)
  } finally {
    context.database.close()
  }
}

const reportError = (message: string): void => {
  console.error(pc.red(message))
  process.exitCode = 1
}

const listAllDevices = (slice: DeviceSlice): Device[] | undefined => {
  const devices: Device[] = []
  let cursor: string | undefined

  do {
    const result = slice.listDevices({ limit: 200, cursor })
    if (!result.ok) {
      return undefined
    }

    devices.push(...result.value.items)
    cursor = result.value.nextCursor
  } while (cursor !== undefined)

  return devices
}

type DeviceIdResolution =
  | Readonly<{ kind: "unique"; device: Device }>
  | Readonly<{ kind: "ambiguous"; devices: Device[] }>
  | Readonly<{ kind: "not_found" }>

type DevicesToRemove =
  | Readonly<{ ok: true; devices: Device[] }>
  | Readonly<{ ok: false; message: string }>

const resolveDeviceId = (devices: ReadonlyArray<Device>, reference: string): DeviceIdResolution => {
  const exact = devices.find((device) => device.id === reference)
  if (exact !== undefined) {
    return { kind: "unique", device: exact }
  }

  const matches = devices.filter((device) => device.id.startsWith(reference))
  if (matches.length === 0) {
    return { kind: "not_found" }
  }
  if (matches.length === 1) {
    return { kind: "unique", device: matches[0] }
  }

  return { kind: "ambiguous", devices: matches }
}

const findDevicesToRemove = (params: {
  devices: ReadonlyArray<Device>
  target: RemoveDeviceTarget
}): DevicesToRemove => {
  const { devices, target } = params
  if (target.kind === "name") {
    const matchesName = makeDeviceNameMatcher(target.pattern)
    const matches = devices.filter((device) => matchesName(device.name))
    return matches.length === 0
      ? { ok: false, message: renderDeviceNameNoMatch(target.pattern) }
      : { ok: true, devices: matches }
  }

  const resolved = resolveDeviceId(devices, target.deviceId)
  if (resolved.kind === "not_found") {
    return { ok: false, message: renderDeviceRemoveError({ kind: "device_not_found" }) }
  }
  if (resolved.kind === "ambiguous") {
    return {
      ok: false,
      message: renderAmbiguousDeviceId({ reference: target.deviceId, devices: resolved.devices }),
    }
  }

  return { ok: true, devices: [resolved.device] }
}

const removeDevices = async (params: {
  context: DeviceCommandContext
  target: RemoveDeviceTarget
  skipConfirmation: boolean
  confirm: DeviceCommandDeps["confirm"]
}): Promise<void> => {
  const { context, target } = params
  const devices = listAllDevices(context.slice)
  if (devices === undefined) {
    reportError("Could not list devices.")
    return
  }

  const found = findDevicesToRemove({ devices, target })
  if (!found.ok) {
    reportError(found.message)
    return
  }

  const matches = found.devices

  if (!params.skipConfirmation) {
    const confirmed = await params.confirm(
      renderRemoveDevicesConfirmation({ count: matches.length, target }),
    )
    if (!confirmed) {
      console.log("Cancelled.")
      return
    }
  }

  for (const { id, name } of matches) {
    const result = context.slice.removeDevice({ deviceId: id })
    if (!result.ok) {
      reportError(renderDeviceRemoveError(result.error))
      continue
    }

    console.log(renderDeviceRemoved({ deviceId: id, name }))
  }
}

export const makeDeviceCommand = (deps: DeviceCommandDeps = defaultDeviceCommandDeps): Command => {
  const command = new Command("device")
  command.description("manage paired devices")

  command
    .command("list")
    // Presence (online/offline) is tracked only in daemon process memory, so a
    // CLI process lists devices that are online in a running daemon as offline.
    .description("list paired devices (online state is only known to the daemon)")
    .action(() =>
      withDeviceCommandContext((context) => {
        const result = context.slice.listDevices({ limit: 200 })
        if (!result.ok) {
          reportError("Could not list devices.")
          return
        }

        console.log(renderDeviceList({ devices: result.value.items, colors: pc }))
      }),
    )

  command
    .command("remove")
    .description("remove paired devices by id or name pattern")
    .argument("[id]", "device id")
    .option(
      "--name <pattern>",
      'remove every device whose name matches a case-insensitive glob, e.g. "*gphone*"',
    )
    .option("-y, --yes", "skip the confirmation prompt")
    .action((deviceId: string | undefined, options: { name?: string; yes?: boolean }) => {
      let target: RemoveDeviceTarget
      if (options.name !== undefined) {
        if (deviceId !== undefined) {
          reportError("Use either a device id or --name, not both.")
          return
        }

        target = { kind: "name", pattern: options.name }
      } else if (deviceId !== undefined) {
        target = { kind: "id", deviceId }
      } else {
        reportError("Provide a device id or --name <pattern>.")
        return
      }

      return withDeviceCommandContext((context) =>
        removeDevices({
          context,
          target,
          skipConfirmation: options.yes === true,
          confirm: deps.confirm,
        }),
      )
    })

  return command
}
