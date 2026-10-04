import { Command } from "commander"
import pc from "picocolors"
import { parseConfig } from "server/config"
import { AgentDatabase, openDatabase } from "server/database"
import { assembleDeviceSlice, DeviceSlice } from "server/device"
import { makeRuntimeSettingsFileStore, seedDefaultsFromConfig } from "server/runtime-settings"
import { renderDeviceList, renderDeviceRevokeError, renderDeviceRevoked } from "./device.render"

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
    .description("revoke a paired device")
    .argument("<id>", "device id")
    .action((deviceId: string) =>
      withDeviceCommandContext((context) => {
        const result = context.slice.revokeDevice({ deviceId })
        if (!result.ok) {
          reportError(renderDeviceRevokeError(result.error))
          return
        }

        console.log(renderDeviceRevoked({ deviceId, newlyRevoked: result.value.newlyRevoked }))
      }),
    )

  return command
}
