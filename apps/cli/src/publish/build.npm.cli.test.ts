import { readFile } from "node:fs/promises"
import path from "node:path"
import { beforeAll, describe, expect, test } from "bun:test"
import { main as buildNpmPackage } from "./build.npm.cli"

const cliRoot = path.join(import.meta.dir, "..", "..")
const distDir = path.join(cliRoot, "dist")

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
})
