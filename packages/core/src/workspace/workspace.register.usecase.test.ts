import { describe, expect, test } from "bun:test"
import { Workspace } from "contracts/http/workspace"
import { makeRegisterWorkspace } from "./workspace.register.usecase"

const storedWorkspace = (input: { name: string; canonicalPath: string }): Workspace => ({
  id: "ws_01J0000000000000000000000",
  name: input.name,
  path: input.canonicalPath,
  state: "available",
  createdAt: "2026-01-01T00:00:00.000Z",
  lastUsedAt: "2026-01-01T00:00:00.000Z",
})

const findOrCreateThatInserts = (calls: Array<{ name: string; canonicalPath: string }>) =>
  ((input) => {
    calls.push(input)
    return { ok: true as const, value: storedWorkspace(input), created: true as const }
  }) satisfies Parameters<typeof makeRegisterWorkspace>[0]["findOrCreateWorkspace"]

describe("register workspace", () => {
  test("returns a path error when the folder cannot be canonicalized", async () => {
    const registerWorkspace = makeRegisterWorkspace({
      canonicalizePath: () => ({ ok: false, error: { kind: "missing" } }),
      findOrCreateWorkspace: () => {
        throw new Error("findOrCreateWorkspace should not run when canonicalize fails")
      },
      readDirectoryEntries: () => {
        throw new Error("readDirectoryEntries should not run when canonicalize fails")
      },
      cloneRepository: () => {
        throw new Error("cloneRepository should not run when canonicalize fails")
      },
    })

    const result = await registerWorkspace({ source: "folder", path: "/no/such/dir" })

    expect(result).toEqual({
      ok: false,
      error: { kind: "path", error: { kind: "missing" } },
    })
  })

  test("opens any existing folder and defaults the name to its basename", async () => {
    const calls: Array<{ name: string; canonicalPath: string }> = []
    const registerWorkspace = makeRegisterWorkspace({
      canonicalizePath: () => ({ ok: true, canonicalPath: "/home/ops/widgets" }),
      findOrCreateWorkspace: findOrCreateThatInserts(calls),
      readDirectoryEntries: () => {
        throw new Error("readDirectoryEntries should not run for a folder source")
      },
      cloneRepository: () => {
        throw new Error("cloneRepository should not run for a folder source")
      },
    })

    const result = await registerWorkspace({ source: "folder", path: "/home/ops/widgets" })

    expect(calls).toEqual([{ name: "widgets", canonicalPath: "/home/ops/widgets" }])
    expect(result).toEqual({
      ok: true,
      value: storedWorkspace({ name: "widgets", canonicalPath: "/home/ops/widgets" }),
      created: true,
    })
  })

  test("passes an explicit folder name through", async () => {
    const calls: Array<{ name: string; canonicalPath: string }> = []
    const registerWorkspace = makeRegisterWorkspace({
      canonicalizePath: () => ({ ok: true, canonicalPath: "/home/ops/widgets" }),
      findOrCreateWorkspace: findOrCreateThatInserts(calls),
      readDirectoryEntries: () => {
        throw new Error("readDirectoryEntries should not run for a folder source")
      },
      cloneRepository: () => {
        throw new Error("cloneRepository should not run for a folder source")
      },
    })

    await registerWorkspace({ source: "folder", path: "~/widgets", name: "Widgets" })

    expect(calls).toEqual([{ name: "Widgets", canonicalPath: "/home/ops/widgets" }])
  })

  test("rejects a git url that starts with a dash", async () => {
    const registerWorkspace = makeRegisterWorkspace({
      canonicalizePath: () => {
        throw new Error("canonicalizePath should not run for an option-like url")
      },
      findOrCreateWorkspace: () => {
        throw new Error("findOrCreateWorkspace should not run for an option-like url")
      },
      readDirectoryEntries: () => {
        throw new Error("readDirectoryEntries should not run for an option-like url")
      },
      cloneRepository: () => {
        throw new Error("cloneRepository should not run for an option-like url")
      },
    })

    const result = await registerWorkspace({
      source: "git",
      url: "--upload-pack=evil",
      path: "/home/ops/widgets",
    })

    expect(result).toEqual({ ok: false, error: { kind: "invalid_git_url" } })
  })

  test("refuses to clone into a destination that is not empty", async () => {
    const registerWorkspace = makeRegisterWorkspace({
      canonicalizePath: () => ({ ok: true, canonicalPath: "/home/ops/widgets" }),
      findOrCreateWorkspace: () => {
        throw new Error("findOrCreateWorkspace should not run for a non-empty destination")
      },
      readDirectoryEntries: async () => [{ name: "README.md" }],
      cloneRepository: () => {
        throw new Error("cloneRepository should not run for a non-empty destination")
      },
    })

    const result = await registerWorkspace({
      source: "git",
      url: "https://github.com/acme/widgets.git",
      path: "/home/ops/widgets",
    })

    expect(result).toEqual({ ok: false, error: { kind: "destination_not_empty" } })
  })

  test("reports a clone failure with the destination path", async () => {
    const registerWorkspace = makeRegisterWorkspace({
      canonicalizePath: () => ({ ok: true, canonicalPath: "/home/ops/widgets" }),
      findOrCreateWorkspace: () => {
        throw new Error("findOrCreateWorkspace should not run when the clone fails")
      },
      readDirectoryEntries: async () => [],
      cloneRepository: async () => ({
        ok: false,
        error: { kind: "clone_failed", detail: "repository not found" },
      }),
    })

    const result = await registerWorkspace({
      source: "git",
      url: "https://github.com/acme/missing.git",
      path: "/home/ops/widgets",
    })

    expect(result).toEqual({
      ok: false,
      error: {
        kind: "clone_failed",
        detail: "Clone failed for /home/ops/widgets: repository not found",
      },
    })
  })

  test("clones, then finds or creates by canonical destination", async () => {
    const calls: Array<{ name: string; canonicalPath: string }> = []
    const cloneCalls: Array<{ url: string; destinationPath: string }> = []
    const registerWorkspace = makeRegisterWorkspace({
      canonicalizePath: () => ({ ok: true, canonicalPath: "/home/ops/widgets" }),
      findOrCreateWorkspace: findOrCreateThatInserts(calls),
      readDirectoryEntries: async () => [],
      cloneRepository: async (input) => {
        cloneCalls.push(input)
        return { ok: true }
      },
    })

    const result = await registerWorkspace({
      source: "git",
      url: "git@github.com:acme/widgets.git",
      path: "/home/ops/widgets",
    })

    expect(cloneCalls).toEqual([
      { url: "git@github.com:acme/widgets.git", destinationPath: "/home/ops/widgets" },
    ])
    expect(calls).toEqual([{ name: "widgets", canonicalPath: "/home/ops/widgets" }])
    expect(result.ok).toBe(true)
  })

  test("uses an explicit git workspace name", async () => {
    const calls: Array<{ name: string; canonicalPath: string }> = []
    const registerWorkspace = makeRegisterWorkspace({
      canonicalizePath: () => ({ ok: true, canonicalPath: "/home/ops/widgets" }),
      findOrCreateWorkspace: findOrCreateThatInserts(calls),
      readDirectoryEntries: async () => [],
      cloneRepository: async () => ({ ok: true }),
    })

    await registerWorkspace({
      source: "git",
      url: "https://github.com/acme/widgets.git",
      path: "/home/ops/widgets",
      name: "Widgets",
    })

    expect(calls).toEqual([{ name: "Widgets", canonicalPath: "/home/ops/widgets" }])
  })
})
