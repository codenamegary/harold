import { describe, expect, test } from "bun:test"
import { join } from "node:path"
import { Glob } from "bun"
import { checkStructure } from "./structure"

const repoRoot = join(import.meta.dir, "../..")
const sourceRoots = ["apps/server/src", "packages/core/src"]

describe("backend source tree", () => {
  test("every use case and ports file follows the structure rules", async () => {
    const files = sourceRoots.flatMap((root) =>
      [...new Glob("**/*.ts").scanSync({ cwd: join(repoRoot, root) })].map((file) =>
        join(root, file),
      ),
    )
    expect(files.length).toBeGreaterThan(100)
    expect(files.filter((file) => file.endsWith(".usecase.ts")).length).toBeGreaterThan(0)
    expect(files.filter((file) => file.endsWith(".ports.ts")).length).toBeGreaterThan(0)

    const violations: string[] = []
    for (const file of files) {
      const source = await Bun.file(join(repoRoot, file)).text()
      for (const violation of checkStructure(file, source)) {
        violations.push(`${file}: ${violation.message}`)
      }
    }

    expect(violations).toEqual([])
  })
})
