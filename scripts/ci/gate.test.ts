import { describe, expect, test } from "bun:test"
import { join } from "node:path"
import { gatePasses } from "./gate"

const repoRoot = join(import.meta.dir, "../..")

describe("gatePasses", () => {
  test("passes when every job succeeded", () => {
    expect(gatePasses(["success", "success", "success", "success"])).toBe(true)
  })

  test("passes when path-filtered jobs were skipped", () => {
    expect(gatePasses(["success", "skipped", "success", "skipped"])).toBe(true)
  })

  test("fails when a job failed", () => {
    expect(gatePasses(["success", "failure", "success", "skipped"])).toBe(false)
  })

  test("fails when a job was cancelled", () => {
    expect(gatePasses(["cancelled", "success", "skipped", "success"])).toBe(false)
  })

  test("fails on an unknown result instead of passing it", () => {
    expect(gatePasses(["success", "weird", "success"])).toBe(false)
  })

  test("fails when no results were reported at all", () => {
    expect(gatePasses([])).toBe(false)
  })
})

describe("gate command exit code", () => {
  const run = async (...results: string[]): Promise<number> =>
    Bun.spawn(["bun", "run", "scripts/ci/gate.ts", ...results], {
      cwd: repoRoot,
      stdout: "ignore",
      stderr: "ignore",
    }).exited

  test("exits zero when the verdict is pass", async () => {
    expect(await run("success", "skipped", "success")).toBe(0)
  })

  test("exits nonzero when the verdict is fail", async () => {
    expect(await run("success", "failure", "skipped")).toBe(1)
  })
})
