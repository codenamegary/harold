import React, { useState } from "react"
import { Session, SessionState } from "contracts/http/session"
import { AgentId } from "contracts/http/agent-settings"
import { Workspace } from "contracts/http/workspace"
import { InlineEditableText } from "../design-system/InlineEditableText"
import { isSessionUpdateError } from "../session/update.session"
import { ArchiveSessionModal } from "../session/ArchiveSessionModal"
import { sessionMutationErrorMessage } from "../session/session.mutation.error.message"
import { useUpdateSessionMutation } from "../session/use.update.session.mutation"
import { ChatSelectors } from "./ChatSelectors"

type ChatHeaderProps = {
  workspaces: ReadonlyArray<Workspace>
  agents: ReadonlyArray<{ id: AgentId; displayName: string; enabled: boolean }>
  sessions: ReadonlyArray<Session>
  workspaceId: string
  agentId: AgentId | ""
  sessionId: string
  selectedSession: Session | undefined
  selectedSessionState: SessionState | null
  onWorkspaceChange: (workspaceId: string) => void
  onAgentChange: (agentId: AgentId | "") => void
  onSessionChange: (sessionId: string) => void
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
  onWorkspaceChange,
  onAgentChange,
  onSessionChange,
  onSessionArchived,
}) => {
  const [isEditingName, setIsEditingName] = useState(false)
  const [isArchiveModalOpen, setIsArchiveModalOpen] = useState(false)
  const updateSessionMutation = useUpdateSessionMutation()

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

  return (
    <>
      <header className="flex min-h-[56px] items-center justify-between gap-3 border-b border-line-soft px-5 max-[820px]:flex-wrap max-[820px]:p-[13px]">
        <div className="flex min-w-0 flex-1 items-center gap-2">
          {selectedSession !== undefined ? (
            <>
              <InlineEditableText
                value={selectedSession.name}
                onSave={handleRenameSave}
                onCancel={handleRenameCancel}
                onEditingChange={setIsEditingName}
                isSaving={updateSessionMutation.isPending}
                error={renameError}
                ariaLabel={`Rename ${selectedSession.name}`}
              />
              {!isEditingName ? (
                <button
                  type="button"
                  aria-label={`Archive ${selectedSession.name}`}
                  className="flex size-5 shrink-0 items-center justify-center self-center rounded text-base leading-none text-dim hover:text-red-400"
                  onClick={() => setIsArchiveModalOpen(true)}
                >
                  ×
                </button>
              ) : null}
            </>
          ) : null}
        </div>
        <div className="flex items-center gap-2 max-[820px]:flex-wrap">
          <ChatSelectors
            workspaces={workspaces}
            agents={agents}
            sessions={sessions}
            workspaceId={workspaceId}
            agentId={agentId}
            sessionId={sessionId}
            selectedSessionState={selectedSessionState}
            onWorkspaceChange={onWorkspaceChange}
            onAgentChange={onAgentChange}
            onSessionChange={onSessionChange}
          />
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
    </>
  )
}
