import React from "react"
import { ChatHeader } from "./ChatHeader"
import { WelcomeMessage } from "./WelcomeMessage"
import { ChatComposer } from "./ChatComposer"

export const ChatShell: React.FC = () => (
  <div className="flex h-[calc(100vh-143px)] min-h-[600px] flex-col overflow-hidden rounded-[10px] border border-line-soft bg-panel max-[820px]:h-[calc(100vh-123px)] max-[820px]:min-h-[520px]">
    <ChatHeader />
    <div className="flex-1 overflow-y-auto px-[max(25px,calc((100%-800px)/2))] py-[25px] [scrollbar-color:#252b34_transparent] max-[820px]:px-[13px] max-[820px]:py-[18px]">
      <WelcomeMessage />
    </div>
    <div className="px-5 pb-5 max-[820px]:px-2.5 max-[820px]:pb-2.5">
      <ChatComposer />
    </div>
  </div>
)
