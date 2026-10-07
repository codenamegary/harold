import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import { mkdtemp, rm } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { parseConfig } from "server/config"
import { openDatabase } from "server/database"
import { assembleDeviceSlice } from "server/device"
import { makePairCommand } from "./pair.command"

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
    await makePairCommand().parseAsync([...args], { from: "user" })
  } finally {
    console.log = originalLog
    console.error = originalErr
  }
  const exitCode = process.exitCode
  process.exitCode = previousExitCode
  return { output: lines.join("\n"), errOutput: errLines.join("\n"), exitCode }
}

describe("harold pair command wiring", () => {
  let dataDir = ""
  let previousDataDir: string | undefined

  beforeAll(async () => {
    const scratch = await mkdtemp(path.join(os.tmpdir(), "harold-cli-pair-"))
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

  test("--no-wait --json persists a pairing code", async () => {
    const { output, exitCode } = await runCommand(["--no-wait", "--json"])

    expect(exitCode).toBe(0)

    const pairing = JSON.parse(output) as {
      id: string
      code: string
      endpoint: string
      state: string
      qrUri: string
    }
    expect(pairing.endpoint).toBe("http://127.0.0.1:3847")
    expect(pairing.state).toBe("active")
    expect(pairing.code).toMatch(/^[A-Z0-9]{3}-[A-Z0-9]{3}$/)
    expect(pairing.qrUri).toContain("harold://pair?v=1")

    const config = parseConfig({ HAROLD_DATA_DIR: dataDir })
    const database = openDatabase({ dataDir: config.dataDir })
    const slice = assembleDeviceSlice({
      database,
      loopbackEndpoint: `http://${config.host}:${config.port}`,
      getAdvertisedEndpointSettings: () => ({
        advertisedUrl: null,
        advertisedUrlEnabled: false,
      }),
    })

    expect(slice.getPairingCodeById(pairing.id)?.state).toBe("active")
    database.close()
  })

  test("rejects an unknown --endpoint value", async () => {
    const { errOutput, exitCode } = await runCommand(["--endpoint", "bad", "--no-wait"])

    expect(exitCode).toBe(1)
    expect(errOutput).toContain('--endpoint must be "loopback" or "advertised".')
  })
})
