import React, { useMemo, useState } from "react"
import { AcpSession, SessionState } from "contracts/http/session"
import { AgentId } from "contracts/http/agent-settings"
import { Workspace } from "contracts/http/workspace"
import { Combobox, ComboboxOptionItem } from "../design-system/Combobox"
import { StatusDot } from "../design-system/StatusDot"
import { catalogSessionKey, parseCatalogSessionKey } from "../session/catalog.session.key"
import { NewSessionModal } from "./NewSessionModal"
import { sessionStatusDotVariant } from "./session.status.dot.variant"

const NEW_SESSION_VALUE = ""

type ChatHeaderProps = {
  workspaces: ReadonlyArray<Workspace>
  agents: ReadonlyArray<{ id: AgentId; displayName: string; enabled: boolean }>
  sessions: ReadonlyArray<AcpSession>
  workspaceId: string
  agentId: string
  sessionId: string
  selectedSession: AcpSession | undefined
  selectedSessionState: SessionState | null
  onJoinSession: (params: { agentId: string; sessionId: string }) => void
  onStartNewSession: (selection: { workspaceId: string; agentId: AgentId }) => void
  onSessionMenuOpen: () => void
}

export const ChatHeader: React.FC<ChatHeaderProps> = ({
  workspaces,
  agents,
  sessions,
  workspaceId,
  agentId,
  sessionId,
  selectedSession,
  selectedSessionState,
  onJoinSession,
  onStartNewSession,
  onSessionMenuOpen,
}) => {
  const [isNewSessionModalOpen, setIsNewSessionModalOpen] = useState(false)

  const selectedKey =
    sessionId === "" || agentId === ""
      ? ""
      : catalogSessionKey({ agentId, sessionId })

  const sessionOptions = useMemo((): ComboboxOptionItem[] => {
    const items: ComboboxOptionItem[] = [
      {
        value: NEW_SESSION_VALUE,
        label: "New session",
        description: "Pick a workspace and agent",
      },
      ...sessions.map((session) => ({
        value: catalogSessionKey({
          agentId: session.agentId,
          sessionId: session.sessionId,
        }),
        label: session.title,
        description: `${session.agentId} · ${session.cwd}`,
      })),
    ]

    if (
      selectedKey !== "" &&
      selectedSession === undefined &&
      !items.some((item) => item.value === selectedKey)
    ) {
      items.splice(1, 0, {
        value: selectedKey,
        label: "Current session",
        description: selectedSessionState ?? undefined,
      })
    }

    return items
  }, [sessions, selectedSession, selectedSessionState, selectedKey])

  const sessionPickerValue =
    sessionId === "" && workspaceId !== "" && agentId !== ""
      ? NEW_SESSION_VALUE
      : selectedKey

  const sessionDisplayOptions = useMemo((): ComboboxOptionItem[] => {
    if (sessionPickerValue !== NEW_SESSION_VALUE) {
      return sessionOptions
    }

    const withoutDuplicateNew = sessionOptions.filter(
      (option) => option.value !== NEW_SESSION_VALUE,
    )
    return [
      {
        value: NEW_SESSION_VALUE,
        label: "New session",
        description: "Ready to send a prompt",
      },
      ...withoutDuplicateNew,
    ]
  }, [sessionOptions, sessionPickerValue])

  const workspaceName =
    workspaces.find((workspace) => workspace.id === workspaceId)?.name ??
    (workspaceId === "" ? null : "Workspace")
  const agentName =
    agents.find((agent) => agent.id === agentId)?.displayName ??
    (agentId === "" ? null : agentId)

  const contextSubtitle =
    workspaceName !== null && agentName !== null
      ? `${workspaceName} · ${agentName}`
      : null

  const selectedStatusDotVariant =
    selectedSessionState === null ? null : sessionStatusDotVariant(selectedSessionState)

  const handleSessionPickerChange = (nextValue: string) => {
    if (nextValue === NEW_SESSION_VALUE) {
      setIsNewSessionModalOpen(true)
      return
    }

    const parsed = parseCatalogSessionKey(nextValue)
    if (parsed === null) {
      return
    }

    onJoinSession(parsed)
  }

  return (
    <>
      <header className="flex min-h-[64px] items-center justify-between gap-3 border-b border-line-soft px-5 max-[820px]:flex-wrap max-[820px]:p-[13px]">
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <div className="flex min-w-0 items-center gap-2">
            {selectedStatusDotVariant !== null ? (
              <StatusDot variant={selectedStatusDotVariant} />
            ) : null}
            <Combobox
              variant="title"
              aria-label="Session"
              value={sessionPickerValue}
              onChange={handleSessionPickerChange}
              onOpen={onSessionMenuOpen}
              options={sessionDisplayOptions}
              placeholder="Select a session"
              emptyMessage="No sessions"
              className="min-w-0 flex-1"
            />
          </div>
          {contextSubtitle !== null ? (
            <p className="m-0 truncate text-xs text-dim">{contextSubtitle}</p>
          ) : null}
        </div>
      </header>
      <NewSessionModal
        open={isNewSessionModalOpen}
        agents={agents}
        onClose={() => setIsNewSessionModalOpen(false)}
        onConfirm={(selection) => {
          setIsNewSessionModalOpen(false)
          onStartNewSession(selection)
        }}
      />
    </>
  )
}
