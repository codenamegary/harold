import { describe, expect, test } from "bun:test"
import { Token } from "../../design-system/prompt.input.model"
import { AvailableCommand } from "../live/commands.available"
import { commandQuery, filterCommands } from "./commands.filter"

const commands: ReadonlyArray<AvailableCommand> = [
  { name: "plan", description: "Look at code" },
  { name: "play", description: "Play it back" },
  { name: "review", description: "Check the diff" },
  { name: "web", description: "Review hosted pages" },
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
    expect(namesOf("pl")).toEqual(["plan", "play"])
  })

  test("matches a name that contains the query", () => {
    expect(namesOf("lan")).toEqual(["plan"])
  })

  test("ranks a name match above a description match", () => {
    expect(namesOf("review")).toEqual(["review", "web"])
  })

  test("matches a description that contains the query", () => {
    expect(namesOf("hosted")).toEqual(["web"])
  })

  test("ignores case on name and description", () => {
    expect(namesOf("REV")).toEqual(["review", "web"])
    expect(namesOf("HOSTED")).toEqual(["web"])
  })

  test("keeps catalog order on an empty query", () => {
    expect(namesOf("")).toEqual(["plan", "play", "review", "web"])
  })

  test("drops commands that match nowhere", () => {
    expect(namesOf("zzz")).toEqual([])
  })
})
