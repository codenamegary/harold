import React from "react"
import { SquareTerminal } from "lucide-react"

export const WelcomeMessage: React.FC = () => (
  <div className="mx-auto my-17.5 max-w-107.5 text-center max-[820px]:my-10">
    <div
      aria-hidden
      className="mx-auto mb-4 grid size-10.5 place-items-center rounded-lg border border-line-input bg-surface-raised text-lime"
    >
      <SquareTerminal className="size-5" />
    </div>
    <h3 className="m-0 mb-2 text-lg">Chat with an agent</h3>
    <p className="text-base text-muted">
      Send a prompt directly to an agent without leaving the console.
    </p>
  </div>
)
