import { describe, expect, test } from "bun:test"
import {
  decodeWorkspacePageCursor,
  encodeWorkspacePageCursor,
} from "./workspace-page-cursor"

describe("workspace page cursor", () => {
  test("round-trips after edge", () => {
    const payload = { id: "ws_01JFC8C7E77NQCFH0RF9Z22JHH", edge: "after" as const }
    const cursor = encodeWorkspacePageCursor(payload)

    expect(decodeWorkspacePageCursor(cursor)).toEqual({ ok: true, value: payload })
  })

  test("round-trips before edge", () => {
    const payload = { id: "ws_01JFC8C7E77NQCFH0RF9Z22JHH", edge: "before" as const }
    const cursor = encodeWorkspacePageCursor(payload)

    expect(decodeWorkspacePageCursor(cursor)).toEqual({ ok: true, value: payload })
  })

  test("rejects malformed cursors", () => {
    expect(decodeWorkspacePageCursor("not-base64-json")).toEqual({ ok: false })
    expect(
      decodeWorkspacePageCursor(
        Buffer.from(JSON.stringify({ id: "ws_01", edge: "sideways" })).toString("base64url"),
      ),
    ).toEqual({ ok: false })
  })
})
