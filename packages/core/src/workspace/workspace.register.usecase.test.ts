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

describe("register workspace", () => {
  test("returns a path error when the directory cannot be canonicalized", () => {
    const registerWorkspace = makeRegisterWorkspace({
      canonicalizePath: () => ({ ok: false, error: { kind: "missing" } }),
      getAllowedRoots: () => ["/allowed"],
      insertWorkspace: () => {
        throw new Error("insertWorkspace should not run when canonicalize fails")
      },
    })

    const result = registerWorkspace({ name: "Missing", path: "/no/such/dir" })

    expect(result).toEqual({
      ok: false,
      error: { kind: "path", error: { kind: "missing" } },
    })
  })

  test("returns outside_allowed_root when no allowed roots are configured", () => {
    const registerWorkspace = makeRegisterWorkspace({
      canonicalizePath: () => ({ ok: true, canonicalPath: "/projects/app" }),
      getAllowedRoots: () => [],
      insertWorkspace: () => {
        throw new Error("insertWorkspace should not run when no roots are configured")
      },
    })

    const result = registerWorkspace({ name: "App", path: "/projects/app" })

    expect(result).toEqual({ ok: false, error: { kind: "outside_allowed_root" } })
  })

  test("returns outside_allowed_root when the canonical path is not under a root", () => {
    const registerWorkspace = makeRegisterWorkspace({
      canonicalizePath: () => ({ ok: true, canonicalPath: "/outside/app" }),
      getAllowedRoots: () => ["/allowed"],
      insertWorkspace: () => {
        throw new Error("insertWorkspace should not run when the path is outside roots")
      },
    })

    const result = registerWorkspace({ name: "App", path: "/outside/app" })

    expect(result).toEqual({ ok: false, error: { kind: "outside_allowed_root" } })
  })

  test("returns duplicate_path when insert finds a unique path conflict", () => {
    const registerWorkspace = makeRegisterWorkspace({
      canonicalizePath: () => ({ ok: true, canonicalPath: "/allowed/app" }),
      getAllowedRoots: () => ["/allowed"],
      insertWorkspace: () => ({ ok: false, error: { kind: "duplicate_path" } }),
    })

    const result = registerWorkspace({ name: "App", path: "/allowed/app" })

    expect(result).toEqual({ ok: false, error: { kind: "duplicate_path" } })
  })

  test("inserts and returns the workspace when the path is under an allowed root", () => {
    const registerWorkspace = makeRegisterWorkspace({
      canonicalizePath: () => ({ ok: true, canonicalPath: "/allowed/app" }),
      getAllowedRoots: () => ["/allowed"],
      insertWorkspace: (input) => ({ ok: true, value: storedWorkspace(input) }),
    })

    const result = registerWorkspace({ name: "App", path: "/allowed/app" })

    expect(result).toEqual({
      ok: true,
      value: storedWorkspace({ name: "App", canonicalPath: "/allowed/app" }),
    })
  })
})
