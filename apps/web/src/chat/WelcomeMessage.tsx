import React from "react"

export const WelcomeMessage: React.FC = () => (
  <div className="mx-auto my-[70px] max-w-[430px] text-center max-[820px]:my-10">
    <div
      aria-hidden
      className="mx-auto mb-[15px] grid size-[42px] place-items-center rounded-[10px] border border-[#2b333f] bg-[#14181f] font-mono text-sm text-lime"
    >
      ›_
    </div>
    <h3 className="m-0 mb-2 text-lg">Test your ACP connection</h3>
    <p className="text-sm text-muted">
      Send a prompt directly to an agent without leaving the console.
    </p>
  </div>
)
