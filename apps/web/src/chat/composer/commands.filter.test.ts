import { describe, expect, test } from "bun:test"
import { Token } from "../../design-system/prompt.input.model"
import { AvailableCommand } from "../live/commands.available"
import { commandQuery, filterCommands } from "./commands.filter"

const commands: ReadonlyArray<AvailableCommand> = [
  { name: "plan", description: "Draft a plan" },
  { name: "play", description: "Play it back" },
  { name: "review", description: "Review the diff" },
]

const namesOf = (query: string): ReadonlyArray<string> =>
  filterCommands(commands, query).map((command) => command.name)

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
  test("keeps prefix matches first, in catalog order", () => {
    expect(namesOf("pl")).toEqual(["plan", "play", "review"])
  })

  test("ranks a mid-name typo above farther names", () => {
    expect(namesOf("lan")[0]).toBe("plan")
  })

  test("ranks a swapped pair as a close match", () => {
    expect(namesOf("plna")[0]).toBe("plan")
  })

  test("ignores case on both sides", () => {
    expect(namesOf("REV")[0]).toBe("review")
  })

  test("keeps catalog order on an empty query", () => {
    expect(namesOf("")).toEqual(["plan", "play", "review"])
  })

  test("never drops a command", () => {
    expect(namesOf("zzz")).toHaveLength(3)
  })
})
