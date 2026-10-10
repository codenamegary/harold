import { describe, expect, test } from "bun:test"
import { makeResolveSessionFolder } from "./attachments.resolve.session.folder.usecase"

const resolve = (overrides: {
  cwd?: string
  canonical?: { ok: true; canonicalPath: string } | { ok: false; error: { kind: "missing" } }
  roots?: readonly string[]
}) =>
  makeResolveSessionFolder({
    findSessionCwd: () => overrides.cwd,
    canonicalizePath: () => overrides.canonical ?? { ok: true, canonicalPath: overrides.cwd ?? "" },
    getAllowedRoots: () => overrides.roots ?? ["/home/me/sites"],
  })({ agentId: "cursor", sessionId: "s1" })

describe("makeResolveSessionFolder", () => {
  test("returns the canonical folder when it sits below an allowed root", () => {
    expect(
      resolve({
        cwd: "/home/me/sites/app-link",
        canonical: { ok: true, canonicalPath: "/home/me/sites/app" },
      }),
    ).toEqual({ ok: true, value: "/home/me/sites/app" })
  })

  test("accepts the allowed root itself", () => {
    expect(resolve({ cwd: "/home/me/sites" })).toEqual({ ok: true, value: "/home/me/sites" })
  })

  test("reports an unknown session", () => {
    expect(resolve({ cwd: undefined })).toEqual({ ok: false, error: { kind: "unknown_session" } })
  })

  test("reports a folder that cannot be resolved", () => {
    expect(resolve({ cwd: "/gone", canonical: { ok: false, error: { kind: "missing" } } })).toEqual(
      { ok: false, error: { kind: "folder_unavailable" } },
    )
  })

  test("rejects a folder outside the allowed roots", () => {
    expect(resolve({ cwd: "/etc" })).toEqual({
      ok: false,
      error: { kind: "outside_allowed_roots" },
    })
  })

  test("rejects a sibling that only shares a name prefix with a root", () => {
    expect(resolve({ cwd: "/home/me/sites-old/app" })).toEqual({
      ok: false,
      error: { kind: "outside_allowed_roots" },
    })
  })

  test("rejects everything when no roots are allowed", () => {
    expect(resolve({ cwd: "/home/me/sites/app", roots: [] })).toEqual({
      ok: false,
      error: { kind: "outside_allowed_roots" },
    })
  })
})
