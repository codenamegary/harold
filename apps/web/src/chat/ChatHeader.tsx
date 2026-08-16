import React, { useMemo, useState } from "react"
import { useNavigate } from "react-router"
import { AcpSession, SessionState } from "contracts/http/session"
import { AgentId } from "contracts/http/agent-settings"
import { Workspace } from "contracts/http/workspace"
import { Button } from "../design-system/Button"
import { Combobox, ComboboxOptionItem } from "../design-system/Combobox"
import { StatusDot } from "../design-system/StatusDot"
import { catalogSessionKey, parseCatalogSessionKey } from "../session/catalog.session.key"
import { recentSessions, RECENT_SESSIONS_LIMIT } from "../session/session.list.helpers"
import { NewSessionModal } from "./NewSessionModal"
import { sessionStatusDotVariant } from "./session.status.dot.variant"

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
  const navigate = useNavigate()
  const [isNewSessionModalOpen, setIsNewSessionModalOpen] = useState(false)

  const selectedKey =
    sessionId === "" || agentId === ""
      ? ""
      : catalogSessionKey({ agentId, sessionId })

  const readyForNewSession =
    sessionId === "" && workspaceId !== "" && agentId !== ""

  const sessionOptions = useMemo((): ComboboxOptionItem[] => {
    const recent = recentSessions(sessions)
    const recentKeys = new Set(
      recent.map((session) =>
        catalogSessionKey({
          agentId: session.agentId,
          sessionId: session.sessionId,
        }),
      ),
    )
    const menuSessions =
      selectedSession !== undefined &&
      !recentKeys.has(
        catalogSessionKey({
          agentId: selectedSession.agentId,
          sessionId: selectedSession.sessionId,
        }),
      )
        ? [selectedSession, ...recent].slice(0, RECENT_SESSIONS_LIMIT)
        : recent

    const items: ComboboxOptionItem[] = menuSessions.map((session) => ({
      value: catalogSessionKey({
        agentId: session.agentId,
        sessionId: session.sessionId,
      }),
      label: session.title,
      description: `${session.agentId} · ${session.cwd}`,
    }))

    if (
      selectedKey !== "" &&
      selectedSession === undefined &&
      !items.some((item) => item.value === selectedKey)
    ) {
      items.unshift({
        value: selectedKey,
        label: "Current session",
        description: selectedSessionState ?? undefined,
      })
    }

    return items
  }, [sessions, selectedSession, selectedSessionState, selectedKey])

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
    const parsed = parseCatalogSessionKey(nextValue)
    if (parsed === null) {
      return
    }

    onJoinSession(parsed)
  }

  return (
    <>
      <header className="flex min-h-[64px] shrink-0 items-center justify-between gap-3 border-b border-line-soft px-5 max-[820px]:flex-wrap max-[820px]:p-[13px]">
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <div className="flex min-w-0 items-center gap-2">
            {selectedStatusDotVariant !== null ? (
              <StatusDot variant={selectedStatusDotVariant} />
            ) : null}
            <Combobox
              variant="title"
              aria-label="Session"
              value={selectedKey}
              onChange={handleSessionPickerChange}
              onOpen={onSessionMenuOpen}
              options={sessionOptions}
              placeholder={readyForNewSession ? "New session" : "Select a session"}
              emptyMessage="No sessions"
              className="min-w-0 flex-1"
            />
          </div>
          {contextSubtitle !== null ? (
            <p className="m-0 truncate text-xs text-dim">{contextSubtitle}</p>
          ) : null}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Button
            variant="secondary"
            onClick={() => {
              void navigate("/sessions")
            }}
          >
            All sessions
          </Button>
          <Button
            variant="primary"
            onClick={() => setIsNewSessionModalOpen(true)}
          >
            New session
          </Button>
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
