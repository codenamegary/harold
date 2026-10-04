import { afterEach, describe, expect, test } from "bun:test"
import { mkdtemp, rm, writeFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { settingsFileName } from "./runtime-settings.file.adapters"

const tempDirs: string[] = []
const serverRoot = path.resolve(import.meta.dir, "../..")

const createTempDataDir = async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "harold-corrupt-boot-"))
  tempDirs.push(dir)
  return dir
}

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })))
})

describe("server boot with invalid settings.yml", () => {
  test("exits non-zero when settings.yml is corrupt", async () => {
    const dataDir = await createTempDataDir()
    await writeFile(path.join(dataDir, settingsFileName), "{ not: valid: yaml [[[\n", "utf8")

    const proc = Bun.spawn(["bun", "run", "src/main.ts"], {
      cwd: serverRoot,
      env: {
        ...process.env,
        HAROLD_HOST: "127.0.0.1",
        HAROLD_PORT: "0",
        HAROLD_DATA_DIR: dataDir,
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
