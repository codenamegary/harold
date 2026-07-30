import React from "react"
import { IconButton } from "../design-system/IconButton"
import { ChatSelectors } from "./ChatSelectors"
import { AgentId } from "contracts/http/agent-settings"
import { Session } from "contracts/http/session"
import { Workspace } from "contracts/http/workspace"

type ChatHeaderProps = {
  workspaces: ReadonlyArray<Workspace>
  agents: ReadonlyArray<{ id: AgentId; displayName: string; enabled: boolean }>
  sessions: ReadonlyArray<Session>
  workspaceId: string
  agentId: AgentId | ""
  sessionId: string
  onWorkspaceChange: (workspaceId: string) => void
  onAgentChange: (agentId: AgentId | "") => void
  onSessionChange: (sessionId: string) => void
}

export const ChatHeader: React.FC<ChatHeaderProps> = (props) => (
  <header className="flex min-h-[56px] items-center justify-end border-b border-line-soft px-5 max-[820px]:p-[13px]">
    <div className="flex items-center gap-2 max-[820px]:flex-wrap">
      <ChatSelectors {...props} />
      <IconButton aria-label="Clear chat" disabled>
        ⌫
      </IconButton>
    </div>
  </header>
)
