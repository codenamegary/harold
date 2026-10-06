import { readFile } from "node:fs/promises"
import path from "node:path"
import { describe, expect, test } from "bun:test"

const repoRoot = path.join(import.meta.dir, "..", "..", "..", "..")

describe("release-please config", () => {
  test("releases the CLI package with the node releaser", async () => {
    const config = JSON.parse(
      await readFile(path.join(repoRoot, "release-please-config.json"), "utf8"),
    )

    // The node releaser is what bumps apps/cli/package.json; "simple" only
    // writes the changelog and manifest, which leaves the shipped artifact
    // version behind the release.
    expect(config["release-type"]).toBe("node")
    expect(config.packages["apps/cli"]).toBeDefined()
  })
})
