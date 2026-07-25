import React from "react"
import { ChatShell } from "../../chat/ChatShell"

export const ChatPage: React.FC = () => (
  <main>
    <h1 className="sr-only">Agent playground</h1>
    <ChatShell />
  </main>
)
