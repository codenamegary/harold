import { describe, expect, test } from "bun:test"
import { sanitizePermissionOptions } from "./sanitize.permission.options"

describe("sanitizePermissionOptions", () => {
  test("keeps optionId, name, and kind when valid", () => {
    expect(
      sanitizePermissionOptions([
        { optionId: "allow-once", name: "Allow once", kind: "allow" },
        { optionId: "reject-once", name: "Reject once", kind: "deny" },
      ]),
    ).toEqual([
      { optionId: "allow-once", name: "Allow once", kind: "allow" },
      { optionId: "reject-once", name: "Reject once", kind: "deny" },
    ])
  })

  test("drops invalid options and unknown kinds", () => {
    expect(
      sanitizePermissionOptions([
        { optionId: "", name: "Bad" },
        { optionId: "allow-once", name: "Allow once", kind: "maybe" },
      ]),
    ).toEqual([{ optionId: "allow-once", name: "Allow once" }])
  })
})
