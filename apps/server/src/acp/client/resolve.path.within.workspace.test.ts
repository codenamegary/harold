import { describe, expect, test } from "bun:test"
import { mkdtemp, rm, writeFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { resolvePathWithinWorkspace } from "./resolve.path.within.workspace"

describe("resolvePathWithinWorkspace", () => {
  test("allows paths inside the workspace root", async () => {
    const workspace = await mkdtemp(path.join(os.tmpdir(), "acp-path-"))
    const filePath = path.join(workspace, "notes.txt")
    await writeFile(filePath, "ok", "utf8")

    const result = resolvePathWithinWorkspace({
      workspaceRoot: workspace,
      filePath,
    })

    expect(result).toEqual({ ok: true, absolutePath: filePath })

    await rm(workspace, { recursive: true, force: true })
  })

  test("rejects paths outside the workspace root", async () => {
    const workspace = await mkdtemp(path.join(os.tmpdir(), "acp-path-"))
    const outside = path.join(os.tmpdir(), `outside-${Date.now()}.txt`)
    await writeFile(outside, "outside", "utf8")

    const result = resolvePathWithinWorkspace({
      workspaceRoot: workspace,
      filePath: outside,
    })

    expect(result).toEqual({ ok: false, reason: "path outside workspace root" })

    await rm(workspace, { recursive: true, force: true })
    await rm(outside, { force: true })
  })

  test("rejects traversal outside the workspace root", async () => {
    const workspace = await mkdtemp(path.join(os.tmpdir(), "acp-path-"))

    const result = resolvePathWithinWorkspace({
      workspaceRoot: workspace,
      filePath: "../escape.txt",
    })

    expect(result).toEqual({ ok: false, reason: "path outside workspace root" })

    await rm(workspace, { recursive: true, force: true })
  })
})
