import { readFile } from "node:fs/promises"
import path from "node:path"
import { describe, expect, test } from "bun:test"

const repoRoot = path.join(import.meta.dir, "..", "..", "..", "..")

const loadConfig = async () =>
  JSON.parse(await readFile(path.join(repoRoot, "release-please-config.json"), "utf8")) as {
    packages: Record<
      string,
      {
        "release-type"?: string
        component?: string
        "package-name"?: string
        "changelog-path"?: string
        "version-file"?: string
        "extra-files"?: Array<{ type: string; path: string; jsonpath?: string }>
        "exclude-paths"?: string[]
      }
    >
  }

describe("release-please config", () => {
  test("releases the CLI bundle from the repo root", async () => {
    const config = await loadConfig()
    const cli = config.packages["."]

    // The published CLI bundles apps/cli, apps/server, packages/core, and
    // packages/contracts. release-please filters commits by package path, so
    // the release unit has to sit at the repo root to see all of them.
    expect(cli).toBeDefined()
    expect(config.packages["apps/cli"]).toBeUndefined()
    expect(cli["release-type"]).toBe("simple")
    expect(cli.component).toBe("harold")
    expect(cli["package-name"]).toBe("@codenamegary/harold")
    expect(cli["changelog-path"]).toBe("apps/cli/CHANGELOG.md")
    expect(cli["version-file"]).toBe("apps/cli/version.txt")

    // The simple releaser does not bump package.json on its own. The JSON
    // updater is what keeps the shipped npm manifest on the release version.
    expect(cli["extra-files"]).toContainEqual({
      type: "json",
      path: "apps/cli/package.json",
      jsonpath: "$.version",
    })
  })

  test("excludes workspace changes that never reach the npm bundle", async () => {
    const config = await loadConfig()
    const excluded = config.packages["."]["exclude-paths"]

    expect(excluded).toEqual(
      expect.arrayContaining([
        ".agents",
        ".cursor",
        ".github",
        ".husky",
        ".opencode",
        "apps/android",
        "docs",
        "packages/test-support",
        "prototype",
        "scripts",
      ]),
    )
    for (const shipped of ["apps/cli", "apps/server", "packages/core", "packages/contracts"]) {
      expect(excluded).not.toContain(shipped)
    }
  })

  test("keeps the release version file aligned with the shipped manifest", async () => {
    const manifest = JSON.parse(
      await readFile(path.join(repoRoot, "apps/cli/package.json"), "utf8"),
    ) as { version: string }
    const versionFile = (await readFile(path.join(repoRoot, "apps/cli/version.txt"), "utf8")).trim()

    expect(versionFile).toBe(manifest.version)
  })
})
