import { describe, expect, test } from "bun:test"
import { mkdtemp, rm } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { stripVTControlCharacters } from "node:util"
import { parseConfig } from "server/config"
import { openDatabase } from "server/database"
import { assembleDeviceSlice } from "server/device"
import { DeviceCommandDeps, makeDeviceCommand } from "./device.command"

const seedDevices = (dataDir: string, names: readonly string[]): string[] => {
  const config = parseConfig({ HAROLD_DATA_DIR: dataDir })
  const database = openDatabase({ dataDir })
  const slice = assembleDeviceSlice({
    database,
    loopbackEndpoint: `http://${config.host}:${config.port}`,
    getAdvertisedEndpointSettings: () => ({
      advertisedUrl: null,
      advertisedUrlEnabled: false,
    }),
  })

  const deviceIds = names.map((name) => {
    const created = slice.createProbeDevice()
    if (!created.ok) {
      throw new Error("failed to seed probe device")
    }

    database.sqlite.run("UPDATE devices SET name = ? WHERE id = ?", [name, created.value.device.id])
    return created.value.device.id
  })

  database.close()
  return deviceIds
}

const runCommand = async (
  args: readonly string[],
  deps: Partial<DeviceCommandDeps> = {},
): Promise<{ output: string; errOutput: string; exitCode: number | undefined }> => {
  const lines: string[] = []
  const errLines: string[] = []
  const originalLog = console.log
  const originalErr = console.error
  const previousExitCode = process.exitCode
  console.log = (...values: unknown[]) => {
    lines.push(values.join(" "))
  }
  console.error = (...values: unknown[]) => {
    errLines.push(values.join(" "))
  }
  process.exitCode = 0
  try {
    await makeDeviceCommand({
      confirm: async () => {
        throw new Error("confirm should not be called")
      },
      ...deps,
    }).parseAsync([...args], { from: "user" })
  } finally {
    console.log = originalLog
    console.error = originalErr
  }
  const exitCode = process.exitCode
  process.exitCode = previousExitCode
  return {
    output: stripVTControlCharacters(lines.join("\n")),
    errOutput: stripVTControlCharacters(errLines.join("\n")),
    exitCode,
  }
}

const withDataDir = async (run: (dataDir: string) => Promise<void>): Promise<void> => {
  const scratch = await mkdtemp(path.join(os.tmpdir(), "harold-cli-device-name-"))
  const dataDir = path.join(scratch, "data")
  const previousDataDir = process.env.HAROLD_DATA_DIR
  process.env.HAROLD_DATA_DIR = dataDir
  try {
    await run(dataDir)
  } finally {
    if (previousDataDir === undefined) {
      delete process.env.HAROLD_DATA_DIR
    } else {
      process.env.HAROLD_DATA_DIR = previousDataDir
    }
    await rm(scratch, { recursive: true, force: true })
  }
}

describe("harold device remove --name", () => {
  test("removes every device matching the name pattern", async () => {
    await withDataDir(async (dataDir) => {
      const [firstId, secondId] = seedDevices(dataDir, ["GPhone One", "GPhone Two"])

      const { output, errOutput, exitCode } = await runCommand([
        "remove",
        "--name",
        "*gphone*",
        "--yes",
      ])

      expect(exitCode).toBe(0)
      expect(errOutput).toBe("")
      expect(output).toContain(`Removed device GPhone One (${firstId}).`)
      expect(output).toContain(`Removed device GPhone Two (${secondId}).`)
    })
  })

  test("leaves devices whose names do not match", async () => {
    await withDataDir(async (dataDir) => {
      const [gphoneId, pixelId] = seedDevices(dataDir, ["GPhone", "Pixel"])

      const { output, exitCode } = await runCommand(["remove", "--name", "*gphone*", "--yes"])

      expect(exitCode).toBe(0)
      expect(output).toContain(`Removed device GPhone (${gphoneId}).`)
      expect(output).not.toContain(pixelId)

      const listed = await runCommand(["list"])
      expect(listed.output).toContain("Pixel")
      expect(listed.output).toContain("offline")
    })
  })

  test("reports when no device name matches", async () => {
    await withDataDir(async (dataDir) => {
      seedDevices(dataDir, ["Pixel"])

      const { output, errOutput, exitCode } = await runCommand(["remove", "--name", "*gphone*"])

      expect(exitCode).toBe(1)
      expect(output).toBe("")
      expect(errOutput).toBe('No devices match name pattern "*gphone*".')
    })
  })

  test("prompts with the match count and removes when confirmed", async () => {
    await withDataDir(async (dataDir) => {
      const [firstId, secondId] = seedDevices(dataDir, ["GPhone One", "GPhone Two"])
      const prompts: string[] = []

      const { output, exitCode } = await runCommand(["remove", "--name", "*gphone*"], {
        confirm: async (message) => {
          prompts.push(message)
          return true
        },
      })

      expect(exitCode).toBe(0)
      expect(prompts).toEqual(['Remove 2 devices matching "*gphone*"?'])
      expect(output).toContain(`Removed device GPhone One (${firstId}).`)
      expect(output).toContain(`Removed device GPhone Two (${secondId}).`)
    })
  })

  test("prompts with a count of one when removing by id", async () => {
    await withDataDir(async (dataDir) => {
      const [deviceId] = seedDevices(dataDir, ["Pixel"])
      const prompts: string[] = []

      const { output, exitCode } = await runCommand(["remove", deviceId], {
        confirm: async (message) => {
          prompts.push(message)
          return true
        },
      })

      expect(exitCode).toBe(0)
      expect(prompts).toEqual([`Remove 1 device with id ${deviceId}?`])
      expect(output).toBe(`Removed device Pixel (${deviceId}).`)
    })
  })

  test("does not remove devices when the prompt is declined", async () => {
    await withDataDir(async (dataDir) => {
      seedDevices(dataDir, ["GPhone"])

      const { output, exitCode } = await runCommand(["remove", "--name", "*gphone*"], {
        confirm: async () => false,
      })

      expect(exitCode).toBe(0)
      expect(output).toBe("Cancelled.")

      const listed = await runCommand(["list"])
      expect(listed.output).toContain("GPhone")
      expect(listed.output).toContain("1 device")
    })
  })

  test("reports an ambiguous id prefix", async () => {
    await withDataDir(async (dataDir) => {
      const deviceIds = seedDevices(dataDir, ["GPhone", "Pixel"])

      const { output, errOutput, exitCode } = await runCommand(["remove", "device_", "--yes"])

      expect(exitCode).toBe(1)
      expect(output).toBe("")
      expect(errOutput).toContain('More than one device matches id "device_":')
      expect(errOutput).toContain(deviceIds[0])
      expect(errOutput).toContain(deviceIds[1])
      expect(errOutput).toContain("Use a longer id.")
    })
  })

  test("requires an id or --name", async () => {
    await withDataDir(async () => {
      const { output, errOutput, exitCode } = await runCommand(["remove", "--yes"])

      expect(exitCode).toBe(1)
      expect(output).toBe("")
      expect(errOutput).toBe("Provide a device id or --name <pattern>.")
    })
  })

  test("rejects an id combined with --name", async () => {
    await withDataDir(async (dataDir) => {
      seedDevices(dataDir, ["GPhone"])

      const { errOutput, exitCode } = await runCommand([
        "remove",
        "device_unknown",
        "--name",
        "*gphone*",
        "--yes",
      ])

      expect(exitCode).toBe(1)
      expect(errOutput).toBe("Use either a device id or --name, not both.")
    })
  })
})
