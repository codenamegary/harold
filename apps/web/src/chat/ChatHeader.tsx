import React from "react"
import { IconButton } from "../design-system/IconButton"
import { ChatSelectors } from "./ChatSelectors"

export const ChatHeader: React.FC = () => (
  <header className="flex min-h-[56px] items-center justify-end border-b border-line-soft px-5 max-[820px]:p-[13px]">
    <div className="flex items-center gap-2 max-[820px]:flex-wrap">
      <ChatSelectors />
      <IconButton aria-label="Clear chat" disabled>
        ⌫
      </IconButton>
    </div>
  </header>
)
