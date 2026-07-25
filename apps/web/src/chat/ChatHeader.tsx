import React from "react"
import { StatusDot } from "../design-system/StatusDot"
import { SectionKicker } from "../design-system/SectionKicker"
import { IconButton } from "../design-system/IconButton"
import { ChatSelectors } from "./ChatSelectors"

export const ChatHeader: React.FC = () => (
  <header className="flex min-h-[76px] items-center justify-between border-b border-line-soft px-5 max-[820px]:items-start max-[820px]:gap-3 max-[820px]:p-[13px]">
    <div>
      <SectionKicker className="mb-[5px]">
        <StatusDot variant="online" className="shadow-none" />
        LOCAL TEST SESSION
      </SectionKicker>
      <h2 className="m-0 text-base tracking-[-0.03em]">Agent playground</h2>
    </div>
    <div className="flex items-center gap-2 max-[820px]:flex-wrap">
      <ChatSelectors />
      <IconButton aria-label="Clear chat" disabled>
        ⌫
      </IconButton>
    </div>
  </header>
)
