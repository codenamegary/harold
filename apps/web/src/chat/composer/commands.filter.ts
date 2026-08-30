import { Token } from "../../design-system/prompt.input.model"
import { AvailableCommand } from "../live/commands.available"

/** The typed name, without the leading slash. */
export const commandQuery = (token: Token): string => token.value.slice(1)

const matchRanks = [
  "name-prefix",
  "name-contains",
  "description-prefix",
  "description-contains",
] as const

type MatchRank = (typeof matchRanks)[number]

const rankOf = (command: AvailableCommand, query: string): MatchRank | null => {
  const name = command.name.toLowerCase()
  const description = command.description.toLowerCase()
  if (name.startsWith(query)) {
    return "name-prefix"
  }
  if (name.includes(query)) {
    return "name-contains"
  }
  if (description.startsWith(query)) {
    return "description-prefix"
  }
  if (description.includes(query)) {
    return "description-contains"
  }
  return null
}

export const filterCommands = (
  commands: ReadonlyArray<AvailableCommand>,
  query: string,
): ReadonlyArray<AvailableCommand> => {
  const needle = query.toLowerCase()
  if (needle.length === 0) {
    return commands
  }

  return commands
    .flatMap((command) => {
      const rank = rankOf(command, needle)
      return rank === null ? [] : [{ command, rank }]
    })
    .sort((left, right) => {
      const diff =
        matchRanks.indexOf(left.rank) - matchRanks.indexOf(right.rank)
      if (diff !== 0) {
        return diff
      }
      return 0
    })
    .map((row) => row.command)
}
