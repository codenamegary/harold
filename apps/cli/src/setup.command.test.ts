import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import { chmod, mkdir, mkdtemp, readFile, realpath, rm, writeFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import YAML from "yaml"
import { openDatabase } from "server/database"
import { assembleDeviceSlice } from "server/device"
import { assembleWorkspaceSlice } from "server/workspace"
import { openAgentCli } from "./agent.command"
import { makeSetupCommand } from "./setup.command"
import { SetupPrompts } from "./setup.wizard"

const startCommand = (
  args: readonly string[],
): { lines: string[]; done: Promise<number | undefined> } => {
  const lines: string[] = []
  process.exitCode = undefined

  const done = makeSetupCommand({
    isInteractive: () => false,
    prompts: silentPrompts,
    cwd: () => process.cwd(),
    writeOut: (line) => lines.push(line),
    writeErr: (line) => lines.push(line),
  })
    .parseAsync([...args], { from: "user" })
    .then(() => process.exitCode)

  return { lines, done }
}

const runCommand = async (
  args: readonly string[],
): Promise<{ output: string; exitCode: number | undefined }> => {
  const command = startCommand(args)
  const exitCode = await command.done
  return { output: command.lines.join("\n"), exitCode }
}

const waitForMatch = async (lines: readonly string[], pattern: RegExp): Promise<string> => {
  for (let attempt = 0; attempt < 200; attempt += 1) {
    const match = lines.join("\n").match(pattern)
    if (match?.[1] !== undefined) {
      return match[1]
    }
    await new Promise((resolve) => setTimeout(resolve, 50))
  }

  throw new Error(`no match for ${pattern} in output:\n${lines.join("\n")}`)
}

const silentPrompts: SetupPrompts = {
  intro: () => undefined,
  outro: () => undefined,
  note: () => undefined,
  info: () => undefined,
  warn: () => undefined,
  step: () => undefined,
  multiselect: async () => [],
  text: async () => "",
  select: async () => "",
  confirm: async () => false,
  isCancel: (value): value is symbol => typeof value === "symbol",
  cancel: () => undefined,
}

describe("harold setup command wiring", () => {
  let scratch = ""
  let dataDir = ""
  let binDir = ""
  let workspaceDir = ""
  let agentPath = ""
  let previousDataDir: string | undefined
  let previousPath: string | undefined

  beforeAll(async () => {
    scratch = await mkdtemp(path.join(os.tmpdir(), "harold-cli-setup-"))
    dataDir = path.join(scratch, "data")
    binDir = path.join(scratch, "bin")
    await mkdir(binDir, { recursive: true })
    workspaceDir = await realpath(await mkdir(path.join(scratch, "project"), { recursive: true }))

    agentPath = path.join(binDir, "cursor-agent")
    await writeFile(agentPath, "#!/bin/sh\nexit 0\n")
    await chmod(agentPath, 0o755)

    previousDataDir = process.env.HAROLD_DATA_DIR
    previousPath = process.env.PATH
    process.env.HAROLD_DATA_DIR = dataDir
    process.env.PATH = `${binDir}:${previousPath ?? ""}`
  })

  afterAll(async () => {
    if (previousDataDir === undefined) {
      delete process.env.HAROLD_DATA_DIR
    } else {
      process.env.HAROLD_DATA_DIR = previousDataDir
    }
    if (previousPath === undefined) {
      delete process.env.PATH
    } else {
      process.env.PATH = previousPath
    }
    await rm(scratch, { recursive: true, force: true })
  })

  test("enables the flagged agent and registers the flagged workspace", async () => {
    const { output, exitCode } = await runCommand([
      "--agents",
      "cursor",
      "--workspace",
      workspaceDir,
      "--no-pair",
    ])

    expect(exitCode).toBe(0)
    expect(output).toContain("cursor")

    const settings = YAML.parse(await readFile(path.join(dataDir, "settings.yml"), "utf8")) as {
      allowedRoots: string[]
    }
    expect(settings.allowedRoots).toContain(workspaceDir)

    const cli = openAgentCli({ dataDir })
    try {
      expect(cli.list().find((agent) => agent.id === "cursor")?.enabled).toBe(true)
    } finally {
      cli.close()
    }
  })

  test("re-running is idempotent for the same workspace", async () => {
    const { exitCode } = await runCommand([
      "--agents",
      "cursor",
      "--workspace",
      workspaceDir,
      "--no-pair",
    ])

    expect(exitCode).toBe(0)

    const database = openDatabase({ dataDir })
    try {
      const slice = assembleWorkspaceSlice({
        database,
        getAllowedRoots: () => [workspaceDir],
        listLiveByWorkspaceRoot: () => [],
        closeWorkspaceSessions: async () => ({ failures: [] }),
        unbindWorkspaceSessions: () => undefined,
      })
      expect(slice.listAll()).toHaveLength(1)
    } finally {
      database.close()
    }
  })

  test("rejects an unknown agent id", async () => {
    const { output, exitCode } = await runCommand(["--agents", "nope", "--no-pair"])

    expect(exitCode).toBe(1)
    expect(output).toContain("Unknown agent id: nope.")
  })

  test("pairs a phone against the advertised endpoint persisted in the same run", async () => {
    const statusBody = JSON.stringify({
      version: "0.2.1",
      state: "online",
      bindAddress: "127.0.0.1",
      port: 3847,
      startedAt: "2026-01-01T00:00:00.000Z",
      acp: { state: "ready", activeSessions: 0 },
    })
    const statusServer = Bun.serve({
      port: 0,
      fetch: (request) => {
        const url = new URL(request.url)
        return url.pathname === "/v1/status"
          ? new Response(statusBody, { headers: { "content-type": "application/json" } })
          : new Response("not found", { status: 404 })
      },
    })

    try {
      const advertisedUrl = `http://127.0.0.1:${statusServer.port}`
      await writeFile(
        path.join(dataDir, "daemon-state.json"),
        JSON.stringify({
          pid: process.pid,
          writtenAt: new Date().toISOString(),
          status: {
            version: "0.2.1",
            state: "online",
            bindAddress: "127.0.0.1",
            port: 3847,
            startedAt: new Date().toISOString(),
            acp: { state: "ready", activeSessions: 0 },
          },
        }),
      )

      const command = startCommand([
        "--agents",
        "cursor",
        "--workspace",
        workspaceDir,
        "--advertised-url",
        advertisedUrl,
      ])

      const code = await waitForMatch(command.lines, /code\s+([A-Z0-9]{3}-[A-Z0-9]{3})/)

      const database = openDatabase({ dataDir })
      try {
        const slice = assembleDeviceSlice({
          database,
          loopbackEndpoint: "http://127.0.0.1:3847",
          getAdvertisedEndpointSettings: () => ({
            advertisedUrl,
            advertisedUrlEnabled: true,
          }),
        })
        const claim = await slice.claimPairingCode({ code, body: { name: "Test phone" } })
        expect(claim.ok).toBe(true)
      } finally {
        database.close()
      }

      const exitCode = await command.done
      const output = command.lines.join("\n")

      expect(exitCode).toBe(0)
      expect(output).toContain("Device paired.")
      expect(output).toContain(advertisedUrl)
    } finally {
      await statusServer.stop(true)
      await rm(path.join(dataDir, "daemon-state.json"), { force: true })
    }
  })
})
