import { describe, expect, test } from "bun:test"
import { Token } from "../../design-system/prompt.input.model"
import { AvailableCommand } from "../live/commands.available"
import { commandQuery, filterCommands } from "./commands.filter"

const commands: ReadonlyArray<AvailableCommand> = [
  { name: "plan", description: "Draft a plan" },
  { name: "play", description: "Play it back" },
  { name: "review", description: "Review the diff" },
]

const commandToken = (value: string): Token => ({
  kind: "command",
  value,
  start: 0,
  end: value.length,
})

describe("commandQuery", () => {
  test("drops the leading slash", () => {
    expect(commandQuery(commandToken("/pl"))).toBe("pl")
    expect(commandQuery(commandToken("/"))).toBe("")
  })
})

describe("filterCommands", () => {
  test("keeps prefix matches in catalog order", () => {
    expect(filterCommands(commands, "pl").map((c) => c.name)).toEqual([
      "plan",
      "play",
    ])
  })

  test("ignores case on both sides", () => {
    expect(filterCommands(commands, "REV").map((c) => c.name)).toEqual([
      "review",
    ])
  })

  test("matches everything on an empty query", () => {
    expect(filterCommands(commands, "")).toHaveLength(3)
  })

  test("matches prefixes only, not substrings", () => {
    expect(filterCommands(commands, "lan")).toEqual([])
  })
})
