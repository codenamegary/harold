import { readFile } from "node:fs/promises"
import path from "node:path"
import { describe, expect, test } from "bun:test"

const repoRoot = path.join(import.meta.dir, "..", "..", "..", "..")

describe("release-please config", () => {
  test("releases the CLI package under its own tag component", async () => {
    const config = JSON.parse(
      await readFile(path.join(repoRoot, "release-please-config.json"), "utf8"),
    )

    expect(config.packages["apps/cli"]).toBeDefined()
    // The repo root disables component tags; the CLI must override that so
    // its releases are tagged `harold-vX.Y.Z` and can gate npm publishing.
    expect(config.packages["apps/cli"]["include-component-in-tag"]).toBe(true)
  })
})
