import { Token } from "../../design-system/prompt.input.model"
import { AvailableCommand } from "../live/commands.available"

/** The typed name, without the leading slash. */
export const commandQuery = (token: Token): string => token.value.slice(1)

export const filterCommands = (
  commands: ReadonlyArray<AvailableCommand>,
  query: string,
): ReadonlyArray<AvailableCommand> => {
  const needle = query.toLowerCase()
  return commands.filter((command) =>
    command.name.toLowerCase().startsWith(needle),
  )
}
