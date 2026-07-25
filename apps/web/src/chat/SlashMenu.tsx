import React from "react"
import { slashCommands } from "./chat-commands"

export const SlashMenu: React.FC = () => (
  <div
    aria-label="Slash commands"
    role="menu"
    className="absolute right-0 bottom-full left-0 z-[4] mb-[7px] rounded-lg border border-line-strong bg-[#11151b] p-1.5 shadow-[0_15px_40px_rgba(0,0,0,0.4)]"
  >
    {slashCommands.map(({ command, description }) => (
      <button
        key={command}
        type="button"
        role="menuitem"
        disabled
        aria-label={`${command} ${description}`}
        className="flex min-h-9 w-full cursor-not-allowed items-center gap-[15px] rounded-[5px] border-0 bg-transparent px-[9px] text-left opacity-50"
      >
        <code className="min-w-[50px] font-mono text-xs text-lime">{command}</code>
        <span className="text-2xs text-[#697381]">{description}</span>
      </button>
    ))}
  </div>
)
