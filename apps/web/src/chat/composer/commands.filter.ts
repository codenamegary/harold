import { Token } from "../../design-system/prompt.input.model"
import { damerauLevenshtein } from "../../lib/damerau.levenshtein"
import { AvailableCommand } from "../live/commands.available"

/** The typed name, without the leading slash. */
export const commandQuery = (token: Token): string => token.value.slice(1)

const commandScore = (name: string, query: string): number => {
  const hay = name.toLowerCase()
  return Math.min(
    damerauLevenshtein(query, hay),
    damerauLevenshtein(query, hay.slice(0, query.length)),
  )
}

export const filterCommands = (
  commands: ReadonlyArray<AvailableCommand>,
  query: string,
): ReadonlyArray<AvailableCommand> => {
  const needle = query.toLowerCase()
  if (needle.length === 0) {
    return commands
  }

  return [...commands].sort((left, right) => {
    const diff = commandScore(left.name, needle) - commandScore(right.name, needle)
    if (diff !== 0) {
      return diff
    }
    return 0
  })
}
