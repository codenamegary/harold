import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import { mkdtemp, rm } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { parseConfig } from "server/config"
import { openDatabase } from "server/database"
import { assembleDeviceSlice } from "server/device"
import { makeDeviceCommand } from "./device.command"

const seedProbeDevice = (dataDir: string): string => {
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

  const created = slice.createProbeDevice()
  database.close()

  if (!created.ok) {
    throw new Error("failed to seed probe device")
  }

  return created.value.device.id
}

const runCommand = async (
  args: readonly string[],
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
    await makeDeviceCommand().parseAsync([...args], { from: "user" })
  } finally {
    console.log = originalLog
    console.error = originalErr
  }
  const exitCode = process.exitCode
  process.exitCode = previousExitCode
  return { output: lines.join("\n"), errOutput: errLines.join("\n"), exitCode }
}

describe("harold device", () => {
  let dataDir = ""
  let deviceId = ""
  let previousDataDir: string | undefined

  beforeAll(async () => {
    const scratch = await mkdtemp(path.join(os.tmpdir(), "harold-cli-device-"))
    dataDir = path.join(scratch, "data")
    previousDataDir = process.env.HAROLD_DATA_DIR
    process.env.HAROLD_DATA_DIR = dataDir
  })

  afterAll(async () => {
    if (previousDataDir === undefined) {
      delete process.env.HAROLD_DATA_DIR
    } else {
      process.env.HAROLD_DATA_DIR = previousDataDir
    }
    if (dataDir !== "") {
      await rm(path.dirname(dataDir), { recursive: true, force: true })
    }
  })

  test("list reports the empty state", async () => {
    const { output, exitCode } = await runCommand(["list"])

    expect(exitCode).toBe(0)
    expect(output).toBe("No devices paired yet.")
  })

  test("list prints paired devices in a table", async () => {
    deviceId = seedProbeDevice(dataDir)

    const { output, exitCode } = await runCommand(["list"])

    expect(exitCode).toBe(0)
    expect(output).toContain("ID")
    expect(output).toContain("NAME")
    expect(output).toContain("PLATFORM")
    expect(output).toContain("STATE")
    expect(output).toContain("PAIRED AT")
    expect(output).toContain(deviceId.slice(0, "device_".length + 8))
    expect(output).toContain("Connection test probe")
    expect(output).toContain("offline")
    expect(output).toContain("1 device")
  })

  test("revoke removes the device credential by id", async () => {
    const { output, exitCode } = await runCommand(["revoke", deviceId])

    expect(exitCode).toBe(0)
    expect(output).toBe(`Revoked device ${deviceId}.`)
  })

  test("revoke is idempotent", async () => {
    const { output, exitCode } = await runCommand(["revoke", deviceId])

    expect(exitCode).toBe(0)
    expect(output).toBe(`Device ${deviceId} was already revoked.`)
  })

  test("list still shows a revoked device", async () => {
    const { output, exitCode } = await runCommand(["list"])

    expect(exitCode).toBe(0)
    expect(output).toContain("revoked")
  })

  test("revoke reports an unknown device id", async () => {
    const { errOutput, exitCode } = await runCommand(["revoke", "device_unknown"])

    expect(exitCode).toBe(1)
    expect(errOutput).toContain("No device matches that id.")
  })
})
