import { describe, expect, test } from "bun:test"
import { makeResolveSessionFolder } from "./attachments.resolve.session.folder.usecase"

const resolve = (overrides: {
  cwd?: string
  canonical?: { ok: true; canonicalPath: string } | { ok: false; error: { kind: "missing" } }
}) =>
  makeResolveSessionFolder({
    findSessionCwd: () => overrides.cwd,
    canonicalizePath: () => overrides.canonical ?? { ok: true, canonicalPath: overrides.cwd ?? "" },
  })({ agentId: "cursor", sessionId: "s1" })

describe("makeResolveSessionFolder", () => {
  test("returns the canonical session folder", () => {
    expect(
      resolve({
        cwd: "/home/me/sites/app-link",
        canonical: { ok: true, canonicalPath: "/home/me/sites/app" },
      }),
    ).toEqual({ ok: true, value: "/home/me/sites/app" })
  })

  test("accepts any readable folder, including one outside the home directory", () => {
    expect(resolve({ cwd: "/etc" })).toEqual({ ok: true, value: "/etc" })
  })

  test("reports an unknown session", () => {
    expect(resolve({ cwd: undefined })).toEqual({ ok: false, error: { kind: "unknown_session" } })
  })

  test("reports a folder that cannot be resolved", () => {
    expect(resolve({ cwd: "/gone", canonical: { ok: false, error: { kind: "missing" } } })).toEqual(
      { ok: false, error: { kind: "folder_unavailable" } },
    )
  })
})
