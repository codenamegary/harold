import { describe, expect, test } from "bun:test"
import { makeCreateDirectory } from "./filesystem.create.directory.usecase"

describe("create directory", () => {
  const deps = (createDirectory: Parameters<typeof makeCreateDirectory>[0]["createDirectory"]) =>
    makeCreateDirectory({
      canonicalizePath: () => ({ ok: true, canonicalPath: "/home/ops" }),
      createDirectory,
    })

  test("creates one directory under a canonical parent", async () => {
    const created: string[] = []
    const createDirectory = deps(async (dirPath) => {
      created.push(dirPath)
      return { ok: true }
    })

    const result = await createDirectory({ parent: "~/", name: "widgets" })

    expect(created).toEqual(["/home/ops/widgets"])
    expect(result).toEqual({ ok: true, value: { name: "widgets", path: "/home/ops/widgets" } })
  })

  test("returns a path error when the parent cannot be canonicalized", async () => {
    const createDirectory = makeCreateDirectory({
      canonicalizePath: () => ({ ok: false, error: { kind: "missing" } }),
      createDirectory: () => {
        throw new Error("createDirectory should not run when the parent is invalid")
      },
    })

    expect(await createDirectory({ parent: "/no/such", name: "widgets" })).toEqual({
      ok: false,
      error: { kind: "path", error: { kind: "missing" } },
    })
  })

  test("rejects names that are not one path segment", async () => {
    const createDirectory = deps(() => {
      throw new Error("createDirectory should not run for an invalid name")
    })

    const invalidNames = ["", ".", "..", "a/b", "a\\b", "a\0b"]

    for (const name of invalidNames) {
      expect(await createDirectory({ parent: "/home/ops", name })).toEqual({
        ok: false,
        error: { kind: "invalid_name" },
      })
    }
  })

  test("reports an existing directory", async () => {
    const createDirectory = deps(async () => ({ ok: false, error: { kind: "already_exists" } }))

    expect(await createDirectory({ parent: "/home/ops", name: "widgets" })).toEqual({
      ok: false,
      error: { kind: "already_exists" },
    })
  })

  test("reports a permission failure", async () => {
    const createDirectory = deps(async () => ({ ok: false, error: { kind: "permission_denied" } }))

    expect(await createDirectory({ parent: "/home/ops", name: "widgets" })).toEqual({
      ok: false,
      error: { kind: "permission_denied" },
    })
  })
})
