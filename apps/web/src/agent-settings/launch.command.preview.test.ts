import { describe, expect, test } from "bun:test"
import { formatLaunchCommandPreview } from "./launch.command.preview"

describe("formatLaunchCommandPreview", () => {
  test("joins path and args in order", () => {
    expect(formatLaunchCommandPreview("npx", ["-y", "@scope/pkg", "acp"])).toBe(
      "npx -y @scope/pkg acp",
    )
  })

  test("quotes empty and spaced args", () => {
    expect(formatLaunchCommandPreview("/opt/agent", ["", "my arg", 'say "hi"'])).toBe(
      `/opt/agent "" "my arg" "say \\"hi\\""`,
    )
  })

  test("shows path alone when args are empty", () => {
    expect(formatLaunchCommandPreview("/usr/bin/claude", [])).toBe("/usr/bin/claude")
  })

  test("returns empty string when path and args are empty", () => {
    expect(formatLaunchCommandPreview("", [])).toBe("")
  })
})
