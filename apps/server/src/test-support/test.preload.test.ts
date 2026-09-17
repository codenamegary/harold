import { expect, test } from "bun:test"
import { writeFile } from "node:fs/promises"
import path from "node:path"
import { bootTestDirectory, disposeTestResources } from "./test.harness"

test("Bun preload cleans resources after failed and timed-out tests without local hooks", async () => {
  const directory = await bootTestDirectory()
  const fixture = path.join(directory, "preload.test.ts")
  const harness = JSON.stringify(path.join(import.meta.dir, "test.harness.ts"))
  await writeFile(
    fixture,
    `
import { test, expect } from "bun:test"
import { existsSync } from "node:fs"
import { bootTestApp, bootTestDatabase } from ${harness}
const previous = []
test("intentional failure", async () => {
  previous.push(await bootTestApp())
  throw new Error("intentional fixture failure")
})
test("previous failed test was cleaned", () => {
  for (const resource of previous) {
    expect(existsSync(resource.dataDir)).toBe(false)
    expect(() => resource.database.sqlite.query("SELECT 1").get()).toThrow()
  }
  console.log("FAILED_TEST_CLEANED")
})
test("intentional timeout", async () => {
  previous.push(await bootTestDatabase())
  await Bun.sleep(150)
}, 50)
test("previous timed out test was cleaned", () => {
  for (const resource of previous) {
    expect(existsSync(resource.dataDir)).toBe(false)
    expect(() => resource.database.sqlite.query("SELECT 1").get()).toThrow()
  }
  console.log("TIMED_OUT_TEST_CLEANED")
})
`,
  )
  const child = Bun.spawn([process.execPath, "test", fixture, "--timeout", "20000"], {
    cwd: path.resolve(import.meta.dir, "../.."),
    env: { ...process.env, NODE_ENV: "test" },
    stdout: "pipe",
    stderr: "pipe",
  })
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ])
  expect(exitCode).toBe(1)
  expect(stdout + stderr).toContain("FAILED_TEST_CLEANED")
  expect(stdout + stderr).toContain("TIMED_OUT_TEST_CLEANED")
  expect(stdout + stderr).toContain("2 pass")
  expect(stdout + stderr).toContain("2 fail")
  await disposeTestResources()
})
