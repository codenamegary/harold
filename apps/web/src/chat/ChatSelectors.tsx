import React from "react"
import { AgentId } from "contracts/http/agent-settings"
import { Session } from "contracts/http/session"
import { Workspace } from "contracts/http/workspace"

const NEW_SESSION_VALUE = ""

type ChatSelectorsProps = {
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

export const ChatSelectors: React.FC<ChatSelectorsProps> = ({
  workspaces,
  agents,
  sessions,
  workspaceId,
  agentId,
  sessionId,
  onWorkspaceChange,
  onAgentChange,
  onSessionChange,
}) => {
  const enabledAgents = agents.filter((agent) => agent.enabled)
  const filteredSessions =
    agentId === ""
      ? sessions
      : sessions.filter((session) => session.agentId === agentId)

  const sessionOptions =
    sessionId !== "" && !filteredSessions.some((session) => session.id === sessionId)
      ? [
          ...filteredSessions,
          {
            id: sessionId,
            name: "Current session",
            agentId: agentId === "" ? ("cursor" as AgentId) : agentId,
          },
        ]
      : filteredSessions

  return (
    <div className="flex items-center gap-2">
      <label className="h-[43px] min-w-[145px] rounded-md border border-line bg-[#0b0e12] px-[9px] py-1.5 max-[820px]:min-w-0 max-[820px]:w-[100px]">
        <span className="mb-[3px] block font-mono text-2xs text-dim">Workspace</span>
        <select
          aria-label="Workspace"
          value={workspaceId}
          onChange={(event) => onWorkspaceChange(event.target.value)}
          className="block w-full appearance-none border-0 bg-transparent text-xs text-[#c3cad3] outline-0"
        >
          <option value="">Select…</option>
          {workspaces.map((workspace) => (
            <option key={workspace.id} value={workspace.id}>
              {workspace.name}
            </option>
          ))}
        </select>
      </label>
      <label className="h-[43px] min-w-[145px] rounded-md border border-line bg-[#0b0e12] px-[9px] py-1.5 max-[820px]:hidden">
        <span className="mb-[3px] block font-mono text-2xs text-dim">Agent</span>
        <select
          aria-label="Agent"
          value={agentId}
          onChange={(event) => onAgentChange(event.target.value as AgentId | "")}
          className="block w-full appearance-none border-0 bg-transparent text-xs text-[#c3cad3] outline-0"
        >
          <option value="">Select…</option>
          {enabledAgents.map((agent) => (
            <option key={agent.id} value={agent.id}>
              {agent.displayName}
            </option>
          ))}
        </select>
      </label>
      <label className="h-[43px] min-w-[145px] rounded-md border border-line bg-[#0b0e12] px-[9px] py-1.5 max-[820px]:min-w-0 max-[820px]:w-[100px]">
        <span className="mb-[3px] block font-mono text-2xs text-dim">Session</span>
        <select
          aria-label="Session"
          value={sessionId}
          onChange={(event) => onSessionChange(event.target.value)}
          disabled={workspaceId === ""}
          className="block w-full appearance-none border-0 bg-transparent text-xs text-[#c3cad3] outline-0 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <option value={NEW_SESSION_VALUE}>New</option>
          {sessionOptions.map((session) => (
            <option key={session.id} value={session.id}>
              {session.name}
            </option>
          ))}
        </select>
      </label>
    </div>
  )
}
