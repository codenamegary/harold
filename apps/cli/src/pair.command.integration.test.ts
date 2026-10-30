import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import os from "node:os"
import path from "node:path"
import YAML from "yaml"
import { parseConfig } from "server/config"
import { openDatabase } from "server/database"
import { assembleDeviceSlice } from "server/device"
import { advertisedEndpointsFileName } from "core/network/advertised.endpoints.node.adapters"
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
  let server: Bun.Server
  let endpoint = ""

  beforeAll(async () => {
    const scratch = mkdtempSync(path.join(os.tmpdir(), "harold-cli-pair-"))
    dataDir = path.join(scratch, "data")
    mkdirSync(dataDir, { recursive: true })
    previousDataDir = process.env.HAROLD_DATA_DIR
    process.env.HAROLD_DATA_DIR = dataDir

    // A stand-in daemon: the pair flow probes GET /v1/status before it
    // advertises an endpoint. It binds every interface so the detected LAN
    // address answers, exactly like the real daemon does.
    server = Bun.serve({
      port: 0,
      hostname: "0.0.0.0",
      fetch: () => Response.json({ state: "online", version: "0.0.0-test" }),
    })
    endpoint = `http://127.0.0.1:${server.port}`

    // The daemon's port lives in settings.yml, not the environment: pair
    // must resolve its probe port from the same file.
    writeFileSync(
      path.join(dataDir, "settings.yml"),
      YAML.stringify({ bindPort: server.port, logLevel: "info", logPath: null }),
      "utf8",
    )
  }, 20_000)

  afterAll(async () => {
    await server.stop(true)
    if (previousDataDir === undefined) {
      delete process.env.HAROLD_DATA_DIR
    } else {
      process.env.HAROLD_DATA_DIR = previousDataDir
    }
    rmSync(path.dirname(dataDir), { recursive: true, force: true })
  })

  test("--url --no-wait --json persists a pairing code and remembers the endpoint", async () => {
    const { output, exitCode } = await runCommand(["--url", endpoint, "--no-wait", "--json"])

    expect(exitCode).toBe(0)

    const pairing = JSON.parse(output) as {
      id: string
      code: string
      endpoint: string
      state: string
      qrUri: string
    }
    expect(pairing.endpoint).toBe(endpoint)
    expect(pairing.state).toBe("active")
    expect(pairing.code).toMatch(/^[A-Z0-9]{3}-[A-Z0-9]{3}$/)
    expect(pairing.qrUri).toContain("harold://pair?v=1")

    const config = parseConfig({ HAROLD_DATA_DIR: dataDir })
    const database = openDatabase({ dataDir: config.dataDir })
    const slice = assembleDeviceSlice({ database })

    expect(slice.getPairingCodeById(pairing.id)?.state).toBe("active")
    database.close()

    const history = YAML.parse(
      readFileSync(path.join(dataDir, advertisedEndpointsFileName), "utf8"),
    ) as { endpoints: Array<{ url: string; source: string }> }
    expect(history.endpoints[0]?.url).toBe(endpoint)
    expect(history.endpoints[0]?.source).toBe("manual")
  })

  test("an unreachable explicit URL fails without creating a code", async () => {
    // Start and immediately stop a server so the port is guaranteed to
    // refuse connections instead of hanging the probe.
    const dead = Bun.serve({ port: 0, fetch: () => new Response("ok") })
    const deadUrl = `http://127.0.0.1:${dead.port}`
    await dead.stop(true)
    await new Promise((resolve) => setTimeout(resolve, 50))

    const { output, errOutput, exitCode } = await runCommand([
      "--url",
      deadUrl,
      "--no-wait",
      "--json",
    ])

    expect(exitCode).toBe(1)
    expect(output).toBe("")
    expect(errOutput).toContain(deadUrl)
    expect(errOutput).toContain("not reachable")
  })

  test("detection is the default: an explicit URL is optional on the happy path", async () => {
    // History from the first test names this endpoint, so the MRU entry is
    // probed first and wins without any flag.
    const { exitCode } = await runCommand(["--no-wait", "--json"])

    expect(exitCode).toBe(0)
  })

  test("the probe port comes from settings.yml when the environment is silent", async () => {
    // The user-visible failure this pins: with no HAROLD_PORT in the
    // environment, pair used to probe the 3847 default while the daemon ran
    // on the settings.yml port, so nothing was ever reachable.
    rmSync(path.join(dataDir, "advertised-endpoints.yml"), { force: true })

    const { output, errOutput, exitCode } = await runCommand(["--no-wait", "--json"])

    expect(exitCode).toBe(0)
    expect(errOutput).toBe("")

    const pairing = JSON.parse(output) as { endpoint: string }
    expect(pairing.endpoint.endsWith(`:${server.port}`)).toBe(true)
    expect(pairing.endpoint).not.toContain(":3847")
  })
})
