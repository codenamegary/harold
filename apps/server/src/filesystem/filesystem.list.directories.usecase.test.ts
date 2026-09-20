import { describe, expect, test } from "bun:test"
import { makeListDirectories } from "./filesystem.list.directories.usecase"

describe("list directories", () => {
  test("returns a path error when the root cannot be canonicalized", async () => {
    const listDirectories = makeListDirectories({
      canonicalizePath: () => ({ ok: false, error: { kind: "missing" } }),
      readDirectoryEntries: () => {
        throw new Error("readDirectoryEntries should not run when canonicalize fails")
      },
      statPath: () => {
        throw new Error("statPath should not run when canonicalize fails")
      },
    })

    const result = await listDirectories({ root: "/no/such/dir", allowedRoots: ["/allowed"] })

    expect(result).toEqual({
      ok: false,
      error: { kind: "path", error: { kind: "missing" } },
    })
  })

  test("returns not_allowed when the canonical root is not an allowed root", async () => {
    const listDirectories = makeListDirectories({
      canonicalizePath: () => ({ ok: true, canonicalPath: "/outside/code" }),
      readDirectoryEntries: () => {
        throw new Error("readDirectoryEntries should not run when the root is not allowed")
      },
      statPath: () => {
        throw new Error("statPath should not run when the root is not allowed")
      },
    })

    const result = await listDirectories({ root: "/outside/code", allowedRoots: ["/allowed"] })

    expect(result).toEqual({ ok: false, error: { kind: "not_allowed" } })
  })

  test("lists child directories sorted by name with paths joined to the canonical root", async () => {
    const root = "/allowed/code"
    const listDirectories = makeListDirectories({
      canonicalizePath: () => ({ ok: true, canonicalPath: root }),
      readDirectoryEntries: async () => [{ name: "beta" }, { name: "alpha" }],
      statPath: async (childPath) => ({
        ok: true,
        canonicalPath: childPath,
        isDirectory: true,
      }),
    })

    const result = await listDirectories({ root, allowedRoots: [root] })

    expect(result).toEqual({
      ok: true,
      items: [
        { name: "alpha", path: "/allowed/code/alpha" },
        { name: "beta", path: "/allowed/code/beta" },
      ],
    })
  })

  test("omits entries that are not directories or whose stat fails", async () => {
    const root = "/allowed/code"
    const listDirectories = makeListDirectories({
      canonicalizePath: () => ({ ok: true, canonicalPath: root }),
      readDirectoryEntries: async () => [
        { name: "readme.txt" },
        { name: "broken" },
        { name: "dir" },
      ],
      statPath: async (childPath) => {
        if (childPath === "/allowed/code/dir") {
          return { ok: true, canonicalPath: childPath, isDirectory: true }
        }
        if (childPath === "/allowed/code/readme.txt") {
          return { ok: true, canonicalPath: childPath, isDirectory: false }
        }
        return { ok: false }
      },
    })

    const result = await listDirectories({ root, allowedRoots: [root] })

    expect(result).toEqual({
      ok: true,
      items: [{ name: "dir", path: "/allowed/code/dir" }],
    })
  })

  test("omits directories whose canonical path escapes the root", async () => {
    const root = "/allowed/code"
    const listDirectories = makeListDirectories({
      canonicalizePath: () => ({ ok: true, canonicalPath: root }),
      readDirectoryEntries: async () => [{ name: "safe" }, { name: "escape" }],
      statPath: async (childPath) => {
        if (childPath === "/allowed/code/escape") {
          return { ok: true, canonicalPath: "/outside/target", isDirectory: true }
        }
        return { ok: true, canonicalPath: childPath, isDirectory: true }
      },
    })

    const result = await listDirectories({ root, allowedRoots: [root] })

    expect(result).toEqual({
      ok: true,
      items: [{ name: "safe", path: "/allowed/code/safe" }],
    })
  })
})
