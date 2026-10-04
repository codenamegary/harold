import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import { mkdir, mkdtemp, realpath, rm } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { parseConfig } from "server/config"
import { makeRuntimeSettingsFileStore, seedDefaultsFromConfig } from "server/runtime-settings"
import { makeWorkspaceCommand } from "./workspace.command"

const runCommand = async (
  args: readonly string[],
): Promise<{ output: string; exitCode: number }> => {
  const lines: string[] = []
  const originalLog = console.log
  process.exitCode = 0
  console.log = (...values: unknown[]) => {
    lines.push(values.join(" "))
  }
  try {
    await makeWorkspaceCommand().parseAsync([...args], { from: "user" })
  } finally {
    console.log = originalLog
  }
  return { output: lines.join("\n"), exitCode: process.exitCode }
}

const workspaceIdFrom = (output: string): string => {
  const match = output.match(/ws_[0-9A-HJKMNP-TV-Z]{26}/)
  if (match === null) {
    throw new Error(`no workspace id in output: ${output}`)
  }
  return match[0]
}

describe("harold workspace", () => {
  let dataDir = ""
  let projectDir = ""
  let customDir = ""
  let thirdDir = ""
  let thirdId = ""
  let previousDataDir: string | undefined

  beforeAll(async () => {
    const scratch = await mkdtemp(path.join(os.tmpdir(), "harold-cli-workspace-"))
    dataDir = path.join(scratch, "data")
    await mkdir(dataDir, { recursive: true })
    const root = path.join(scratch, "root")
    await mkdir(root)
    const canonicalRoot = await realpath(root)

    projectDir = path.join(canonicalRoot, "project")
    customDir = path.join(canonicalRoot, "custom")
    thirdDir = path.join(canonicalRoot, "third")
    await mkdir(projectDir)
    await mkdir(customDir)
    await mkdir(thirdDir)

    const config = parseConfig({ HAROLD_DATA_DIR: dataDir })
    const settingsStore = makeRuntimeSettingsFileStore({
      dataDir,
      seedDefaults: { ...seedDefaultsFromConfig(config), allowedRoots: [canonicalRoot] },
    })
    settingsStore.get()

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

  test("add registers a workspace named after the directory", async () => {
    const { output, exitCode } = await runCommand(["add", projectDir])

    expect(exitCode).toBe(0)
    expect(output).toContain("Added workspace project")
    expect(output).toContain(projectDir)
  })

  test("add rejects a duplicate path", async () => {
    const { output, exitCode } = await runCommand(["add", projectDir])

    expect(exitCode).toBe(1)
    expect(output).toContain(`A workspace is already registered at ${projectDir}.`)
  })

  test("add rejects a path outside the allowed roots", async () => {
    const outside = path.join(path.dirname(dataDir), "outside")
    await mkdir(outside)

    const { output, exitCode } = await runCommand(["add", outside])

    expect(exitCode).toBe(1)
    expect(output).toContain("outside the allowed roots")
  })

  test("add rejects a path with no directory", async () => {
    const { output, exitCode } = await runCommand(["add", path.join(projectDir, "gone")])

    expect(exitCode).toBe(1)
    expect(output).toContain("No directory at")
  })

  test("add honours an explicit name", async () => {
    const { output, exitCode } = await runCommand(["add", customDir, "--name", "custom"])

    expect(exitCode).toBe(0)
    expect(output).toContain("Added workspace custom")
  })

  test("add registers a third workspace for later removals", async () => {
    const { output, exitCode } = await runCommand(["add", thirdDir])

    expect(exitCode).toBe(0)
    thirdId = workspaceIdFrom(output)
  })

  test("list prints a table of the registered workspaces", async () => {
    const { output, exitCode } = await runCommand(["list"])

    expect(exitCode).toBe(0)
    expect(output).toContain("ID")
    expect(output).toContain("NAME")
    expect(output).toContain("PATH")
    expect(output).toContain("STATE")
    expect(output).toContain("project")
    expect(output).toContain(projectDir)
    expect(output).toContain("3 workspaces")
  })

  test("remove resolves an exact workspace id", async () => {
    const { output, exitCode } = await runCommand(["remove", thirdId])

    expect(exitCode).toBe(0)
    expect(output).toBe(`Removed workspace third (${thirdDir}).`)
  })

  test("remove resolves a canonical path", async () => {
    const { output, exitCode } = await runCommand(["remove", projectDir])

    expect(exitCode).toBe(0)
    expect(output).toBe(`Removed workspace project (${projectDir}).`)
  })

  test("remove resolves a unique name", async () => {
    const { output, exitCode } = await runCommand(["remove", "custom"])

    expect(exitCode).toBe(0)
    expect(output).toBe(`Removed workspace custom (${customDir}).`)
  })

  test("list reports the empty state", async () => {
    const { output, exitCode } = await runCommand(["list"])

    expect(exitCode).toBe(0)
    expect(output).toBe("No workspaces registered yet.")
  })

  test("remove reports a reference that matches nothing", async () => {
    const { output, exitCode } = await runCommand(["remove", "nope"])

    expect(exitCode).toBe(1)
    expect(output).toContain('No workspace matches "nope".')
  })
})
