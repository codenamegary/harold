import { afterEach, describe, expect, test } from "bun:test"
import { mkdtemp, rm, writeFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { settingsFileName } from "./repository"

const tempDirs: string[] = []
const serverRoot = path.resolve(import.meta.dir, "../..")

const createTempDataDir = async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "agent-server-corrupt-boot-"))
  tempDirs.push(dir)
  return dir
}

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })))
})

describe("server boot with invalid settings.yml", () => {
  test("exits non-zero when settings.yml is corrupt", async () => {
    const dataDir = await createTempDataDir()
    await writeFile(
      path.join(dataDir, settingsFileName),
      "{ not: valid: yaml [[[\n",
      "utf8",
    )

    const proc = Bun.spawn(["bun", "run", "src/main.ts"], {
      cwd: serverRoot,
      env: {
        ...process.env,
        AGENT_SERVER_HOST: "127.0.0.1",
        AGENT_SERVER_PORT: "0",
        AGENT_SERVER_DATA_DIR: dataDir,
      },
      stdout: "pipe",
      stderr: "pipe",
    })

    const exitCode = await proc.exited
    const stderr = await new Response(proc.stderr).text()

    expect(exitCode).not.toBe(0)
    expect(stderr).toContain("settings.yml")
  })
})
