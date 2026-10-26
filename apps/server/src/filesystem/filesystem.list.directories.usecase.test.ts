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
      getHomeDirectory: () => "/home/ops",
    })

    const result = await listDirectories({ root: "/no/such/dir" })

    expect(result).toEqual({
      ok: false,
      error: { kind: "path", error: { kind: "missing" } },
    })
  })

  test("starts at the home directory when no root is given", async () => {
    const canonicalized: string[] = []
    const listDirectories = makeListDirectories({
      canonicalizePath: (inputPath) => {
        canonicalized.push(inputPath)
        return { ok: true, canonicalPath: "/home/ops" }
      },
      readDirectoryEntries: async () => [],
      statPath: () => {
        throw new Error("statPath should not run for an empty directory")
      },
      getHomeDirectory: () => "/home/ops",
    })

    const result = await listDirectories({})

    expect(canonicalized).toEqual(["/home/ops"])
    expect(result).toEqual({
      ok: true,
      value: { path: "/home/ops", parent: "/home", items: [] },
    })
  })

  test("lists child directories sorted by name using their canonical targets", async () => {
    const root = "/allowed/code"
    const listDirectories = makeListDirectories({
      canonicalizePath: () => ({ ok: true, canonicalPath: root }),
      readDirectoryEntries: async () => [{ name: "beta" }, { name: "alpha" }, { name: ".hidden" }],
      statPath: async (childPath) => ({
        ok: true,
        canonicalPath: childPath,
        isDirectory: true,
      }),
      getHomeDirectory: () => "/home/ops",
    })

    const result = await listDirectories({ root })

    expect(result).toEqual({
      ok: true,
      value: {
        path: root,
        parent: "/allowed",
        items: [
          { name: ".hidden", path: "/allowed/code/.hidden" },
          { name: "alpha", path: "/allowed/code/alpha" },
          { name: "beta", path: "/allowed/code/beta" },
        ],
      },
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
      getHomeDirectory: () => "/home/ops",
    })

    const result = await listDirectories({ root })

    expect(result).toEqual({
      ok: true,
      value: {
        path: root,
        parent: "/allowed",
        items: [{ name: "dir", path: "/allowed/code/dir" }],
      },
    })
  })

  test("follows directory symlinks and reports the canonical target path", async () => {
    const root = "/allowed/code"
    const listDirectories = makeListDirectories({
      canonicalizePath: () => ({ ok: true, canonicalPath: root }),
      readDirectoryEntries: async () => [{ name: "link" }],
      statPath: async () => ({
        ok: true,
        canonicalPath: "/srv/widgets",
        isDirectory: true,
      }),
      getHomeDirectory: () => "/home/ops",
    })

    const result = await listDirectories({ root })

    expect(result).toEqual({
      ok: true,
      value: {
        path: root,
        parent: "/allowed",
        items: [{ name: "link", path: "/srv/widgets" }],
      },
    })
  })

  test("has no parent at the filesystem root", async () => {
    const listDirectories = makeListDirectories({
      canonicalizePath: () => ({ ok: true, canonicalPath: "/" }),
      readDirectoryEntries: async () => [],
      statPath: () => {
        throw new Error("statPath should not run for an empty directory")
      },
      getHomeDirectory: () => "/home/ops",
    })

    const result = await listDirectories({ root: "/" })

    expect(result).toEqual({ ok: true, value: { path: "/", parent: null, items: [] } })
  })
})
