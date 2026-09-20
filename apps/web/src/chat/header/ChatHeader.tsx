import React, { useEffect, useMemo, useState } from "react"
import { useNavigate } from "react-router"
import { useAtomValue, useSetAtom } from "jotai"
import { AcpSession } from "contracts/http/session"
import { Button } from "../../design-system/Button"
import { Combobox, ComboboxOptionItem } from "../../design-system/Combobox"
import { StatusDot } from "../../design-system/StatusDot"
import { catalogSessionKey, parseCatalogSessionKey } from "../../session/catalog.session.key"
import { recentSessions, RECENT_SESSIONS_LIMIT } from "../../session/session.list.helpers"
import { useAgentSettingsQuery } from "../../agent-settings/use.agent.settings.query"
import { useSessionsQuery } from "../../session/use.sessions.query"
import { useStartNewSession } from "../../session/use.start.new.session"
import { useWorkspacesInfiniteQuery } from "../../workspace/use.workspaces.infinite.query"
import { sessionStateAtom } from "../live/atoms"
import { selectSessionAtom } from "../selection/actions"
import { selectionAtom } from "../selection/atoms"
import { resolveEffectiveSessionState } from "../selection/promptability"
import { NewSessionModal } from "./NewSessionModal"
import { sessionStatusDotVariant } from "./session.status.dot.variant"

const emptySessions: ReadonlyArray<AcpSession> = []

export const ChatHeader: React.FC = () => {
  const navigate = useNavigate()
  const selection = useAtomValue(selectionAtom)
  const transcriptSessionState = useAtomValue(sessionStateAtom)
  const selectSession = useSetAtom(selectSessionAtom)
  const [isNewSessionModalOpen, setIsNewSessionModalOpen] = useState(false)
  const newSession = useStartNewSession({
    onCreated: () => setIsNewSessionModalOpen(false),
  })

  const workspacesQuery = useWorkspacesInfiniteQuery({})
  const agentsQuery = useAgentSettingsQuery()
  const sessionsQuery = useSessionsQuery()

  const workspaces = workspacesQuery.data?.pages.flatMap((page) => page.items) ?? []
  const agents = agentsQuery.data?.items ?? []
  const sessions = sessionsQuery.data?.items ?? emptySessions

  const selectedSession = sessions.find(
    (session) => session.sessionId === selection.sessionId && session.agentId === selection.agentId,
  )
  const selectedSessionState = resolveEffectiveSessionState({
    sessionId: selection.sessionId,
    transcriptSessionState,
    listSessionState: undefined,
  })

  const refetchSessions = sessionsQuery.refetch
  useEffect(() => {
    const refetchCatalog = () => {
      void refetchSessions()
    }

    window.addEventListener("focus", refetchCatalog)
    return () => {
      window.removeEventListener("focus", refetchCatalog)
    }
  }, [refetchSessions])

  const selectedKey =
    selection.sessionId === "" || selection.agentId === ""
      ? ""
      : catalogSessionKey({
          agentId: selection.agentId,
          sessionId: selection.sessionId,
        })

  const readyForNewSession =
    selection.sessionId === "" && selection.workspaceId !== "" && selection.agentId !== ""

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
    workspaces.find((workspace) => workspace.id === selection.workspaceId)?.name ??
    (selection.workspaceId === "" ? null : "Workspace")
  const agentName =
    agents.find((agent) => agent.id === selection.agentId)?.displayName ??
    (selection.agentId === "" ? null : selection.agentId)

  const contextSubtitle =
    workspaceName !== null && agentName !== null ? `${workspaceName} · ${agentName}` : null

  const selectedStatusDotVariant =
    selectedSessionState === null ? null : sessionStatusDotVariant(selectedSessionState)

  const handleJoinSession = (next: { agentId: string; sessionId: string }) => {
    const nextSession = sessions.find(
      (session) => session.sessionId === next.sessionId && session.agentId === next.agentId,
    )
    if (nextSession === undefined) {
      return
    }

    const nextWorkspaceId =
      workspaces.find((workspace) => workspace.path === nextSession.cwd)?.id ?? ""
    selectSession({
      workspaceId: nextWorkspaceId,
      agentId: nextSession.agentId,
      sessionId: nextSession.sessionId,
    })
  }

  const handleSessionPickerChange = (nextValue: string) => {
    const parsed = parseCatalogSessionKey(nextValue)
    if (parsed === null) {
      return
    }

    handleJoinSession(parsed)
  }

  return (
    <>
      <header className="flex min-h-16 shrink-0 items-center justify-between gap-3 border-b border-line-soft px-5 max-[820px]:flex-wrap max-[820px]:p-3.5">
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
              onOpen={() => {
                void sessionsQuery.refetch()
              }}
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
          <Button variant="primary" onClick={() => setIsNewSessionModalOpen(true)}>
            New session
          </Button>
        </div>
      </header>
      <NewSessionModal
        open={isNewSessionModalOpen}
        agents={agents}
        pending={newSession.creating}
        error={newSession.error}
        onClose={() => setIsNewSessionModalOpen(false)}
        onConfirm={(next) => {
          newSession.start(next)
        }}
      />
    </>
  )
}
