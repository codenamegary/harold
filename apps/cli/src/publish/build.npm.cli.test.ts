import { mkdtempSync, rmSync } from "node:fs"
import { readFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { beforeAll, describe, expect, test } from "bun:test"
import { main as buildNpmPackage } from "./build.npm.cli"

const cliRoot = path.join(import.meta.dir, "..", "..")
const distDir = path.join(cliRoot, "dist")

const readUntil = async (stream: ReadableStream<Uint8Array>, marker: string): Promise<string> => {
  const reader = stream.getReader()
  const decoder = new TextDecoder()
  let text = ""

  for (;;) {
    const { done, value } = await reader.read()
    if (done) {
      return text
    }

    text += decoder.decode(value, { stream: true })
    if (text.includes(marker)) {
      return text
    }
  }
}

describe("build.npm.cli", () => {
  beforeAll(async () => {
    await buildNpmPackage()
  }, 120_000)

  describe("publishable manifest", () => {
    test("is the scoped public harold package", async () => {
      const manifest = JSON.parse(await readFile(path.join(distDir, "package.json"), "utf8"))

      expect(manifest.name).toBe("@codenamegary/harold")
      expect(manifest.private).toBeUndefined()
      expect(manifest.bin).toEqual({ harold: "harold.js" })
    })

    test("publishes a dry run without manifest auto-correction", async () => {
      // npm 11.19 strips a "./"-prefixed bin path from the published
      // manifest, which would ship the package with no harold command.
      // The dry run exits nonzero once the version exists on the
      // registry, so the correction warning is the signal to assert.
      const proc = await Bun.$`npm publish --dry-run`.cwd(distDir).nothrow().quiet()
      const output = `${proc.stderr.toString()} ${proc.stdout.toString()}`

      expect(output).not.toContain("auto-corrected")
    })

    test("carries no workspace references", async () => {
      const raw = await readFile(path.join(distDir, "package.json"), "utf8")

      expect(raw).not.toContain("workspace:")
    })

    test("points npm provenance at this repository", async () => {
      // Trusted publishing validates repository.url against the publishing
      // repo; this is the shape the registry accepts.
      const manifest = JSON.parse(await readFile(path.join(distDir, "package.json"), "utf8"))

      expect(manifest.repository).toEqual({
        type: "git",
        url: "git+https://github.com/codenamegary/harold.git",
      })
    })

    test("pins the version of the manifest it was built from", async () => {
      const source = JSON.parse(await readFile(path.join(cliRoot, "package.json"), "utf8"))
      const manifest = JSON.parse(await readFile(path.join(distDir, "package.json"), "utf8"))

      expect(manifest.version).toBe(source.version)
    })
  })

  describe("bundled bin", () => {
    test("is a bun-shebang script", async () => {
      const head = await readFile(path.join(distDir, "harold.js"), "utf8").then((content) =>
        content.slice(0, 20),
      )

      expect(head.startsWith("#!/usr/bin/env bun")).toBe(true)
    })

    test("prints the manifest version on --version", async () => {
      const manifest = JSON.parse(await readFile(path.join(distDir, "package.json"), "utf8"))
      const output = await Bun.$`bun ${path.join(distDir, "harold.js")} --version`.text()

      expect(output.trim()).toBe(manifest.version)
      expect(output.trim()).toMatch(/^\d+\.\d+\.\d+$/)
    })

    test("lists the operator commands on --help", async () => {
      const output = await Bun.$`bun ${path.join(distDir, "harold.js")} --help`.text()

      for (const command of ["serve", "setup", "pair", "connect"]) {
        expect(output).toContain(command)
      }
    })
  })

  describe("bundled database access", () => {
    test("status opens the database without a drizzle folder next to the bundle", async () => {
      const dataDir = mkdtempSync(path.join(tmpdir(), "harold-bundle-status-"))

      try {
        const proc = await Bun.$`bun ${path.join(distDir, "harold.js")} status`
          .env({ ...process.env, HAROLD_DATA_DIR: dataDir })
          .nothrow()
          .quiet()

        expect(proc.exitCode).toBe(0)
        expect(proc.stdout.toString()).toContain(dataDir)
      } finally {
        rmSync(dataDir, { recursive: true, force: true })
      }
    })

    test("serve reaches the running view and shuts down cleanly", async () => {
      const dataDir = mkdtempSync(path.join(tmpdir(), "harold-bundle-serve-"))
      const child = Bun.spawn({
        cmd: [process.execPath, path.join(distDir, "harold.js"), "serve"],
        env: { ...process.env, HAROLD_DATA_DIR: dataDir, HAROLD_PORT: "0" },
        stdin: "ignore",
        stdout: "pipe",
        stderr: "pipe",
      })

      try {
        const stdout = await readUntil(child.stdout, "Harold is running")

        expect(stdout).toContain("Harold is running")

        child.kill()
        const exitCode = await child.exited

        expect(exitCode).toBe(0)
      } finally {
        if (child.exitCode === null) {
          child.kill()
        }
        rmSync(dataDir, { recursive: true, force: true })
      }
    })
  })
})
