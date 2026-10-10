import { afterEach, describe, expect, test } from "bun:test"
import { mkdtemp, readFile, rm } from "node:fs/promises"
import net from "node:net"
import os from "node:os"
import path from "node:path"
import { StatusSchema } from "contracts/http/status"

const tempDirs: string[] = []
const serverRoot = path.resolve(import.meta.dir, "../..")
const cliManifestPath = path.resolve(import.meta.dir, "../../../cli/package.json")

const createTempDataDir = async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "harold-version-boot-"))
  tempDirs.push(dir)
  return dir
}

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })))
})

const reservePort = () =>
  new Promise<number>((resolve, reject) => {
    const probe = net.createServer()
    probe.unref()
    probe.on("error", reject)
    probe.listen({ host: "127.0.0.1", port: 0 }, () => {
      const address = probe.address()
      if (address === null || typeof address === "string") {
        reject(new Error("could not reserve a port"))
        return
      }
      probe.close(() => resolve(address.port))
    })
  })

const readStatusVersion = async (port: number, proc: Bun.Subprocess) => {
  const deadline = Date.now() + 15000
  for (;;) {
    if (proc.exitCode !== null) {
      const stderr = await new Response(proc.stderr).text()
      throw new Error(`harold exited before answering GET /v1/status: ${stderr}`)
    }
    try {
      const response = await fetch(`http://127.0.0.1:${port}/v1/status`)
      if (response.ok) {
        return StatusSchema.parse(await response.json()).version
      }
    } catch {
      // not listening yet
    }
    if (Date.now() >= deadline) {
      throw new Error("harold did not answer GET /v1/status in time")
    }
    await new Promise((resolve) => setTimeout(resolve, 100))
  }
}

describe("run server", () => {
  test("reports the CLI manifest version in GET /v1/status", async () => {
    const cliManifest = JSON.parse(await readFile(cliManifestPath, "utf8")) as { version: string }
    const dataDir = await createTempDataDir()
    const port = await reservePort()

    const proc = Bun.spawn(["bun", "run", "src/main.ts"], {
      cwd: serverRoot,
      env: {
        ...process.env,
        HAROLD_HOST: "127.0.0.1",
        HAROLD_PORT: String(port),
        HAROLD_DATA_DIR: dataDir,
      },
      stdout: "pipe",
      stderr: "pipe",
    })

    try {
      const version = await readStatusVersion(port, proc)
      expect(version).toBe(cliManifest.version)
    } finally {
      proc.kill()
      await proc.exited
    }
  })
})
