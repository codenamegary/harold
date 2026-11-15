import { describe, expect, test } from "bun:test"
import { createVfsStore } from "./vfs.store"

describe("vfs.store", () => {
  test("resolves home, tilde, dot, and relative paths", () => {
    const vfs = createVfsStore({ home: "/home/demo" })

    expect(vfs.resolvePath(".")).toBe("/home/demo")
    expect(vfs.resolvePath("~")).toBe("/home/demo")
    expect(vfs.resolvePath("~/.harold/agents.json")).toBe("/home/demo/.harold/agents.json")
    expect(vfs.resolvePath("sites/cat-screensaver")).toBe("/home/demo/sites/cat-screensaver")
    expect(vfs.resolvePath("/home/demo/sites/../.harold")).toBe("/home/demo/.harold")
  })

  test("writes, reads, stats, lists, and atomically renames files", () => {
    const vfs = createVfsStore({ home: "/home/demo" })

    vfs.mkdir("/home/demo/.harold", { recursive: true })
    vfs.writeFile("/home/demo/.harold/agents.json.tmp", Buffer.from('[{"id":"opencode"}]'))
    vfs.rename("/home/demo/.harold/agents.json.tmp", "/home/demo/.harold/agents.json")

    expect(vfs.stat("/home/demo/.harold/agents.json.tmp")).toBeNull()
    const stat = vfs.stat("/home/demo/.harold/agents.json")
    expect(stat?.isDirectory).toBe(false)
    expect(vfs.readFile("/home/demo/.harold/agents.json")?.toString("utf8")).toBe(
      '[{"id":"opencode"}]',
    )

    const entries = vfs.readdir("/home/demo/.harold")
    expect(entries.map((e) => e.name)).toEqual(["agents.json"])
  })

  test("removes files and directories", () => {
    const vfs = createVfsStore({ home: "/home/demo" })
    vfs.mkdir("/home/demo/tmp", { recursive: true })
    vfs.writeFile("/home/demo/tmp/note.txt", Buffer.from("hi"))

    expect(vfs.remove("/home/demo/tmp/note.txt")).toBe(true)
    expect(vfs.stat("/home/demo/tmp/note.txt")).toBeNull()
  })
})
