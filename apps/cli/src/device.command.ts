import { Command } from "commander"
import pc from "picocolors"
import { Device } from "contracts/http/device"
import { localApiUrl } from "core/status/summary.models"
import { parseConfig } from "server/config"
import { AgentDatabase, openDatabase } from "server/database"
import { assembleDeviceSlice, DeviceSlice } from "server/device"
import { makeRuntimeSettingsFileStore, seedDefaultsFromConfig } from "server/runtime-settings"
import {
  renderDeviceList,
  renderDeviceNameNoMatch,
  renderDeviceRevokeError,
  renderDeviceRevoked,
} from "./device.render"
import { makeDeviceNameMatcher } from "./device.name.pattern"

type DeviceCommandContext = Readonly<{
  slice: DeviceSlice
  database: AgentDatabase
}>

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

const revokeDevicesByName = (params: { context: DeviceCommandContext; pattern: string }): void => {
  const { context, pattern } = params
  const devices = listAllDevices(context.slice)
  if (devices === undefined) {
    reportError("Could not list devices.")
    return
  }

  const matchesName = makeDeviceNameMatcher(pattern)
  const matches = devices.filter((device) => matchesName(device.name))
  if (matches.length === 0) {
    reportError(renderDeviceNameNoMatch(pattern))
    return
  }

  let failed = false
  for (const device of matches) {
    const result = context.slice.revokeDevice({ deviceId: device.id })
    if (!result.ok) {
      reportError(renderDeviceRevokeError(result.error))
      failed = true
      continue
    }

    console.log(
      renderDeviceRevoked({ deviceId: device.id, newlyRevoked: result.value.newlyRevoked }),
    )
  }

  if (failed) {
    process.exitCode = 1
  }
}

export const makeDeviceCommand = (): Command => {
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
    .command("revoke")
    .description("revoke paired devices by id or name pattern")
    .argument("[id]", "device id")
    .option(
      "--name <pattern>",
      'revoke every device whose name matches a case-insensitive glob, e.g. "*gphone*"',
    )
    .action((deviceId: string | undefined, options: { name?: string }) => {
      if (options.name !== undefined) {
        if (deviceId !== undefined) {
          reportError("Use either a device id or --name, not both.")
          return
        }

        const pattern = options.name
        return withDeviceCommandContext((context) => {
          revokeDevicesByName({ context, pattern })
        })
      }

      if (deviceId === undefined) {
        reportError("Provide a device id or --name <pattern>.")
        return
      }

      return withDeviceCommandContext((context) => {
        const result = context.slice.revokeDevice({ deviceId })
        if (!result.ok) {
          reportError(renderDeviceRevokeError(result.error))
          return
        }

        console.log(renderDeviceRevoked({ deviceId, newlyRevoked: result.value.newlyRevoked }))
      })
    })

  return command
}
