import React from "react"
import { promptChips } from "./chat-commands"

export const PromptChips: React.FC = () => (
  <div className="mt-[19px] flex flex-wrap justify-center gap-1.5">
    {promptChips.map((label) => (
      <button
        key={label}
        type="button"
        disabled
        className="min-h-[31px] cursor-not-allowed rounded-md border border-line bg-[#11151b] px-2.5 text-[8px] text-[#808b98] opacity-50"
      >
        {label}
      </button>
    ))}
  </div>
)
