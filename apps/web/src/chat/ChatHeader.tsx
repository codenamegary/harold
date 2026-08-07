import React, { useMemo, useState } from "react"
import { Session, SessionState } from "contracts/http/session"
import { AgentId } from "contracts/http/agent-settings"
import { Workspace } from "contracts/http/workspace"
import { Combobox, ComboboxOptionItem } from "../design-system/Combobox"
import { InlineEditableText } from "../design-system/InlineEditableText"
import { StatusDot } from "../design-system/StatusDot"
import { isSessionUpdateError } from "../session/update.session"
import { ArchiveSessionModal } from "../session/ArchiveSessionModal"
import { sessionMutationErrorMessage } from "../session/session.mutation.error.message"
import { useUpdateSessionMutation } from "../session/use.update.session.mutation"
import { NewSessionModal } from "./NewSessionModal"
import { sessionStatusDotVariant } from "./session.status.dot.variant"

const NEW_SESSION_VALUE = ""

type ChatHeaderProps = {
  workspaces: ReadonlyArray<Workspace>
  agents: ReadonlyArray<{ id: AgentId; displayName: string; enabled: boolean }>
  sessions: ReadonlyArray<Session>
  workspaceId: string
  agentId: AgentId | ""
  sessionId: string
  selectedSession: Session | undefined
  selectedSessionState: SessionState | null
  onJoinSession: (sessionId: string) => void
  onStartNewSession: (selection: { workspaceId: string; agentId: AgentId }) => void
  onSessionArchived: () => void
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
  onSessionArchived,
}) => {
  const [isEditingName, setIsEditingName] = useState(false)
  const [isArchiveModalOpen, setIsArchiveModalOpen] = useState(false)
  const [isNewSessionModalOpen, setIsNewSessionModalOpen] = useState(false)
  const updateSessionMutation = useUpdateSessionMutation()

  const liveSessions = sessions.filter(
    (session) => session.state !== "archived" && session.archivedAt === null,
  )

  const sessionOptions = useMemo((): ComboboxOptionItem[] => {
    const items: ComboboxOptionItem[] = [
      {
        value: NEW_SESSION_VALUE,
        label: "New session",
        description: "Pick a workspace and agent",
      },
      ...liveSessions.map((session) => ({
        value: session.id,
        label: session.name,
        description: `${session.state}`,
      })),
    ]

    if (
      sessionId !== "" &&
      selectedSession === undefined &&
      !items.some((item) => item.value === sessionId)
    ) {
      items.splice(1, 0, {
        value: sessionId,
        label: "Current session",
        description: selectedSessionState ?? undefined,
      })
    }

    return items
  }, [liveSessions, selectedSession, selectedSessionState, sessionId])

  const sessionPickerValue =
    sessionId === "" && workspaceId !== "" && agentId !== ""
      ? NEW_SESSION_VALUE
      : sessionId

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

  const renameError = updateSessionMutation.isError
    ? sessionMutationErrorMessage(
        updateSessionMutation.error,
        isSessionUpdateError,
        "Could not rename session.",
      )
    : undefined

  const handleRenameSave = async (name: string) => {
    if (selectedSession === undefined) {
      return
    }

    await updateSessionMutation.mutateAsync({
      sessionId: selectedSession.id,
      body: { name },
    })
  }

  const handleRenameCancel = () => {
    updateSessionMutation.reset()
  }

  const handleSessionPickerChange = (nextSessionId: string) => {
    if (nextSessionId === NEW_SESSION_VALUE) {
      setIsNewSessionModalOpen(true)
      return
    }
    onJoinSession(nextSessionId)
  }

  return (
    <>
      <header className="flex min-h-[64px] items-center justify-between gap-3 border-b border-line-soft px-5 max-[820px]:flex-wrap max-[820px]:p-[13px]">
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <div className="flex min-w-0 items-center gap-2">
            {selectedStatusDotVariant !== null ? (
              <StatusDot variant={selectedStatusDotVariant} />
            ) : null}
            {isEditingName && selectedSession !== undefined ? (
              <InlineEditableText
                value={selectedSession.name}
                onSave={handleRenameSave}
                onCancel={handleRenameCancel}
                onEditingChange={setIsEditingName}
                isSaving={updateSessionMutation.isPending}
                error={renameError}
                ariaLabel={`Rename ${selectedSession.name}`}
              />
            ) : (
              <Combobox
                variant="title"
                aria-label="Session"
                value={sessionPickerValue}
                onChange={handleSessionPickerChange}
                options={sessionDisplayOptions}
                placeholder="Select a session"
                emptyMessage="No sessions"
                className="min-w-0 flex-1"
              />
            )}
            {selectedSession !== undefined && !isEditingName ? (
              <>
                <button
                  type="button"
                  aria-label={`Edit name for ${selectedSession.name}`}
                  className="flex size-5 shrink-0 items-center justify-center self-center rounded text-xs text-dim hover:text-body"
                  onClick={() => setIsEditingName(true)}
                >
                  ✎
                </button>
                <button
                  type="button"
                  aria-label={`Archive ${selectedSession.name}`}
                  className="flex size-5 shrink-0 items-center justify-center self-center rounded text-base leading-none text-dim hover:text-red-400"
                  onClick={() => setIsArchiveModalOpen(true)}
                >
                  ×
                </button>
              </>
            ) : null}
          </div>
          {contextSubtitle !== null ? (
            <p className="m-0 truncate text-xs text-dim">{contextSubtitle}</p>
          ) : null}
        </div>
      </header>
      {selectedSession !== undefined ? (
        <ArchiveSessionModal
          sessionId={selectedSession.id}
          sessionName={selectedSession.name}
          open={isArchiveModalOpen}
          onClose={() => setIsArchiveModalOpen(false)}
          onArchived={onSessionArchived}
        />
      ) : null}
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
