import React from "react"
import { AvailableCommand } from "../live/commands.available"

type CommandMenuProps = {
  matches: ReadonlyArray<AvailableCommand>
  onPick: (name: string) => void
}

/**
 * Stateless by design. The typed token filters the list, so the first row is
 * always the one Enter takes and there is no highlight to remember.
 */
export const CommandMenu: React.FC<CommandMenuProps> = ({
  matches,
  onPick,
}) => {
  if (matches.length === 0) {
    return (
      <div className="w-[320px] rounded-md border border-line bg-panel-elevated px-3 py-2 shadow-lg">
        <span className="text-xs text-dim">No matching commands</span>
      </div>
    )
  }

  return (
    <ul
      aria-label="Available commands"
      className="max-h-60 w-[320px] overflow-auto rounded-md border border-line bg-panel-elevated py-1 shadow-lg"
    >
      {matches.map((command, index) => (
        <li key={command.name}>
          <button
            type="button"
            aria-selected={index === 0}
            // Keeps focus on the prompt so typing keeps filtering.
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => onPick(command.name)}
            className={`block w-full cursor-pointer px-3 py-1.5 text-left ${
              index === 0 ? "bg-hover-surface" : ""
            }`}
          >
            <span className="flex items-baseline gap-1.5">
              <span className="font-mono text-xs text-lime">
                /{command.name}
              </span>
              {command.hint === undefined ? null : (
                <span className="font-mono text-2xs text-dim">
                  {command.hint}
                </span>
              )}
            </span>
            <span className="block truncate text-2xs text-muted">
              {command.description}
            </span>
          </button>
        </li>
      ))}
    </ul>
  )
}
