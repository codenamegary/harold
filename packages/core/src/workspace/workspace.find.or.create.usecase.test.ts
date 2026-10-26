import { describe, expect, test } from "bun:test"
import { Workspace } from "contracts/http/workspace"
import { makeFindOrCreateWorkspace } from "./workspace.find.or.create.usecase"

const workspace = (input: { id?: string; name: string; canonicalPath: string }): Workspace => ({
  id: input.id ?? "ws_01J0000000000000000000000",
  name: input.name,
  path: input.canonicalPath,
  state: "available",
  createdAt: "2026-01-01T00:00:00.000Z",
  lastUsedAt: "2026-01-01T00:00:00.000Z",
})

const input = { name: "App", canonicalPath: "/projects/app" }

describe("find or create workspace", () => {
  test("returns an existing workspace, keeps its name, and bumps lastUsedAt", () => {
    const existing = workspace({
      id: "ws_existing",
      name: "Old name",
      canonicalPath: "/projects/app",
    })
    const touched = { ...existing, lastUsedAt: "2026-02-01T00:00:00.000Z" }

    const findOrCreate = makeFindOrCreateWorkspace({
      findWorkspaceByCanonicalPath: () => ({ ok: true, value: existing }),
      insertWorkspace: () => {
        throw new Error("insertWorkspace should not run for an existing path")
      },
      touchWorkspaceLastUsedAt: (input) => ({
        ok: true,
        value: { ...touched, id: input.id },
      }),
    })

    expect(findOrCreate(input)).toEqual({ ok: true, value: touched, created: false })
  })

  test("inserts and reports creation when the canonical path is new", () => {
    const findOrCreate = makeFindOrCreateWorkspace({
      findWorkspaceByCanonicalPath: () => ({ ok: false, error: { kind: "not_found" } }),
      insertWorkspace: (value) => ({ ok: true, value: workspace(value) }),
      touchWorkspaceLastUsedAt: () => {
        throw new Error("touchWorkspaceLastUsedAt should not run for a new path")
      },
    })

    expect(findOrCreate(input)).toEqual({
      ok: true,
      value: workspace({ name: "App", canonicalPath: "/projects/app" }),
      created: true,
    })
  })

  test("re-reads and opens the winner when insert loses the unique-path race", () => {
    const raced = workspace({ id: "ws_raced", name: "Winner", canonicalPath: "/projects/app" })
    const findCalls: string[] = []

    const findOrCreate = makeFindOrCreateWorkspace({
      findWorkspaceByCanonicalPath: (query) => {
        findCalls.push(query.canonicalPath)
        return findCalls.length === 1
          ? { ok: false, error: { kind: "not_found" } }
          : { ok: true, value: raced }
      },
      insertWorkspace: () => ({ ok: false, error: { kind: "duplicate_path" } }),
      touchWorkspaceLastUsedAt: ({ id }) => ({ ok: true, value: { ...raced, id } }),
    })

    expect(findOrCreate(input)).toEqual({ ok: true, value: raced, created: false })
    expect(findCalls).toEqual(["/projects/app", "/projects/app"])
  })

  test("returns the re-read error when the raced row disappears", () => {
    const findOrCreate = makeFindOrCreateWorkspace({
      findWorkspaceByCanonicalPath: () => ({ ok: false, error: { kind: "not_found" } }),
      insertWorkspace: () => ({ ok: false, error: { kind: "duplicate_path" } }),
      touchWorkspaceLastUsedAt: () => {
        throw new Error("touchWorkspaceLastUsedAt should not run without a row")
      },
    })

    expect(findOrCreate(input)).toEqual({ ok: false, error: { kind: "not_found" } })
  })

  test("surfaces a failed touch", () => {
    const existing = workspace({ name: "App", canonicalPath: "/projects/app" })

    const findOrCreate = makeFindOrCreateWorkspace({
      findWorkspaceByCanonicalPath: () => ({ ok: true, value: existing }),
      insertWorkspace: () => {
        throw new Error("insertWorkspace should not run for an existing path")
      },
      touchWorkspaceLastUsedAt: () => ({ ok: false, error: { kind: "not_found" } }),
    })

    expect(findOrCreate(input)).toEqual({ ok: false, error: { kind: "not_found" } })
  })
})
