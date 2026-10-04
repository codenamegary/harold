import { describe, expect, test } from "bun:test"
import { Workspace } from "contracts/http/workspace"
import { CanonicalizePath } from "core/workspace/ports"
import { makeResolveWorkspaceReference } from "./workspace.resolve"

const workspace = (overrides: Partial<Workspace>): Workspace => ({
  id: "ws_01J8XYZ000000000000000000",
  name: "harold",
  path: "/srv/harold",
  state: "available",
  createdAt: "2026-01-01T00:00:00.000Z",
  lastUsedAt: "2026-01-01T00:00:00.000Z",
  ...overrides,
})

const canonicalizing: CanonicalizePath = (inputPath) => ({ ok: true, canonicalPath: inputPath })

describe("resolveWorkspaceReference", () => {
  test("resolves an exact workspace id first", () => {
    const harold = workspace()
    const other = workspace({
      id: "ws_01J8ZZZ111111111111111111",
      name: "other",
      path: "/srv/other/harold",
    })
    const resolve = makeResolveWorkspaceReference({
      canonicalizePath: canonicalizing,
      findWorkspaceById: ({ id }) =>
        id === harold.id
          ? { ok: true, value: harold }
          : { ok: false, error: { kind: "not_found" } },
      listAllWorkspaces: () => [other, harold],
    })

    const result = resolve(harold.id)

    expect(result).toEqual({ ok: true, value: harold })
  })

  test("resolves a canonical path after the id misses", () => {
    const harold = workspace()
    const resolve = makeResolveWorkspaceReference({
      canonicalizePath: canonicalizing,
      findWorkspaceById: () => ({ ok: false, error: { kind: "not_found" } }),
      listAllWorkspaces: () => [harold],
    })

    const result = resolve("/srv/harold")

    expect(result).toEqual({ ok: true, value: harold })
  })

  test("canonicalizes the reference before matching paths", () => {
    const harold = workspace({ path: "/srv/harold/current" })
    const resolve = makeResolveWorkspaceReference({
      canonicalizePath: (inputPath) =>
        inputPath === "/srv/link"
          ? { ok: true, canonicalPath: "/srv/harold/current" }
          : { ok: false, error: { kind: "missing" } },
      findWorkspaceById: () => ({ ok: false, error: { kind: "not_found" } }),
      listAllWorkspaces: () => [harold],
    })

    const result = resolve("/srv/link")

    expect(result).toEqual({ ok: true, value: harold })
  })

  test("still matches by name when the reference cannot be canonicalized", () => {
    const harold = workspace()
    const resolve = makeResolveWorkspaceReference({
      canonicalizePath: () => ({ ok: false, error: { kind: "missing" } }),
      findWorkspaceById: () => ({ ok: false, error: { kind: "not_found" } }),
      listAllWorkspaces: () => [harold],
    })

    const result = resolve("harold")

    expect(result).toEqual({ ok: true, value: harold })
  })

  test("rejects a name that matches more than one workspace", () => {
    const first = workspace({ path: "/srv/harold" })
    const second = workspace({
      id: "ws_01J8ZZZ111111111111111111",
      path: "/srv/other/harold",
    })
    const resolve = makeResolveWorkspaceReference({
      canonicalizePath: () => ({ ok: false, error: { kind: "missing" } }),
      findWorkspaceById: () => ({ ok: false, error: { kind: "not_found" } }),
      listAllWorkspaces: () => [first, second],
    })

    const result = resolve("harold")

    expect(result).toEqual({
      ok: false,
      error: { kind: "ambiguous_name", reference: "harold", workspaces: [first, second] },
    })
  })

  test("returns not_found when nothing matches", () => {
    const resolve = makeResolveWorkspaceReference({
      canonicalizePath: canonicalizing,
      findWorkspaceById: () => ({ ok: false, error: { kind: "not_found" } }),
      listAllWorkspaces: () => [workspace()],
    })

    const result = resolve("/srv/unknown")

    expect(result).toEqual({ ok: false, error: { kind: "not_found", reference: "/srv/unknown" } })
  })
})
