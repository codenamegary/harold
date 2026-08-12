import React from "react"
import { useEffect, useLayoutEffect, useRef, useState } from "react"
import { AgentId } from "contracts/http/agent-settings"
import { Event } from "contracts/events/event"
import { PermissionRequest } from "contracts/http/permission"
import { useAgentSettingsQuery } from "../agent-settings/use.agent.settings.query"
import { useWorkspacesInfiniteQuery } from "../workspace/use.workspaces.infinite.query"
import { useSessionsQuery } from "../session/use.sessions.query"
import { useCreateSessionMutation } from "../session/use.create.session.mutation"
import { usePromptSessionMutation } from "../session/use.prompt.session.mutation"
import { useCancelSessionMutation } from "../session/use.cancel.session.mutation"
import { useSelectSessionMutation } from "../session/use.select.session.mutation"
import { useSessionEventStream } from "../session/use.session.event.stream"
import {
  activePermissionRequest,
  applyPermissionEvents,
  mergePendingRead,
} from "../permission/apply.permission.events"
import { fetchPendingPermissions } from "../permission/fetch.pending.permissions"
import { useResolvePermissionMutation } from "../permission/use.resolve.permission.mutation"
import { ChatHeader } from "./ChatHeader"
import { WelcomeMessage } from "./WelcomeMessage"
import { ChatComposer } from "./ChatComposer"
import { ChatTranscript } from "./ChatTranscript"
import { PermissionPanel } from "./PermissionPanel"
import {
  emptyTranscript,
  foldTranscriptEvents,
  TranscriptState,
} from "./transcript.reducer"
import {
  composerBlockedMessage,
  isComposerPromptable,
  resolveEffectiveSessionState,
} from "./chat.promptability"
import {
  clearChatSelection,
  readChatSelection,
  writeChatSelection,
} from "./chat.selection.storage"

export const ChatShell: React.FC = () => {
  const [workspaceId, setWorkspaceId] = useState("")
  const [agentId, setAgentId] = useState("")
  const [sessionId, setSessionId] = useState("")
  const [transcript, setTranscript] = useState<TranscriptState>(emptyTranscript)
  const [pendingPermissions, setPendingPermissions] = useState<PermissionRequest[]>([])
  const [submittingOptionId, setSubmittingOptionId] = useState<string | null>(null)
  const hasAttemptedResume = useRef(false)
  const transcriptScrollRef = useRef<HTMLDivElement>(null)
  const transcriptBottomRef = useRef<HTMLDivElement>(null)

  const workspacesQuery = useWorkspacesInfiniteQuery({})
  const agentsQuery = useAgentSettingsQuery()
  const sessionsQuery = useSessionsQuery()

  const createSessionMutation = useCreateSessionMutation()
  const promptSessionMutation = usePromptSessionMutation()
  const cancelSessionMutation = useCancelSessionMutation()
  const selectSessionMutation = useSelectSessionMutation()
  const resolvePermissionMutation = useResolvePermissionMutation()

  const workspaces =
    workspacesQuery.data?.pages.flatMap((page) => page.items) ?? []
  const agents = agentsQuery.data?.items ?? []
  const sessions = sessionsQuery.data?.items ?? []

  const workspaceIdForCwd = (cwd: string) =>
    workspaces.find((workspace) => workspace.path === cwd)?.id ?? ""

  const persistSelection = (next: {
    workspaceId: string
    agentId: string
    sessionId: string
  }) => {
    writeChatSelection(next)
  }

  useEffect(() => {
    if (hasAttemptedResume.current) {
      return
    }
    if (sessionsQuery.isLoading || sessionsQuery.isError) {
      return
    }

    hasAttemptedResume.current = true
    const saved = readChatSelection()
    if (saved === null || saved.sessionId === "") {
      return
    }

    const sessionItems = sessionsQuery.data?.items ?? []
    const matched = sessionItems.find((session) => session.sessionId === saved.sessionId)
    if (matched === undefined) {
      clearChatSelection()
      return
    }

    const workspaceItems =
      workspacesQuery.data?.pages.flatMap((page) => page.items) ?? []
    const resolvedWorkspaceId =
      workspaceItems.find((workspace) => workspace.path === matched.cwd)?.id ?? ""
    setWorkspaceId(resolvedWorkspaceId)
    setAgentId(matched.agentId)
    setSessionId(matched.sessionId)
    writeChatSelection({
      workspaceId: resolvedWorkspaceId,
      agentId: matched.agentId,
      sessionId: matched.sessionId,
    })
    selectSessionMutation.mutate(matched.sessionId)
  }, [
    sessionsQuery.data?.items,
    sessionsQuery.isError,
    sessionsQuery.isLoading,
    selectSessionMutation,
    workspacesQuery.data?.pages,
  ])

  const handleEvents = (events: ReadonlyArray<Event>) => {
    setTranscript((current) => foldTranscriptEvents(current, events))
    setPendingPermissions((current) => applyPermissionEvents(current, events))
  }

  const handleReconnect = () => {
    setTranscript(emptyTranscript)
    if (sessionId === "") {
      setPendingPermissions([])
      return
    }

    void fetchPendingPermissions(sessionId)
      .then((items) => {
        setPendingPermissions((current) => mergePendingRead(current, items))
      })
      .catch(() => {
        setPendingPermissions([])
      })
  }

  useEffect(() => {
    if (sessionId === "") {
      setPendingPermissions([])
      return
    }

    void fetchPendingPermissions(sessionId)
      .then((items) => {
        setPendingPermissions(items)
      })
      .catch(() => {
        setPendingPermissions([])
      })
  }, [sessionId])

  useSessionEventStream({
    sessionId: sessionId === "" ? null : sessionId,
    enabled: sessionId !== "",
    onEvents: handleEvents,
    onReconnect: handleReconnect,
  })

  const selectedSession = sessions.find((session) => session.sessionId === sessionId)

  const handleSessionArchived = () => {
    setSessionId("")
    setTranscript(emptyTranscript)
    persistSelection({ workspaceId, agentId, sessionId: "" })
  }

  const effectiveSessionState = resolveEffectiveSessionState({
    sessionId,
    transcriptSessionState: transcript.sessionState,
    listSessionState: undefined,
  })
  const runningFromSession =
    effectiveSessionState === "running" || effectiveSessionState === "awaiting-permission"
  const running =
    runningFromSession ||
    createSessionMutation.isPending ||
    promptSessionMutation.isPending

  const activePermission = activePermissionRequest(pendingPermissions)

  const handlePermissionOption = (optionId: string) => {
    if (sessionId === "" || activePermission === null) {
      return
    }

    setSubmittingOptionId(optionId)
    resolvePermissionMutation.mutate(
      {
        sessionId,
        requestId: activePermission.id,
        body: { status: "resolved", optionId },
      },
      {
        onSettled: () => {
          setSubmittingOptionId(null)
        },
      },
    )
  }

  const composerEnabled = isComposerPromptable({
    workspaceId,
    agentId,
    sessionId,
    sessionState: effectiveSessionState,
  })
  const blockedMessage = composerBlockedMessage(effectiveSessionState)

  const handleJoinSession = (nextSessionId: string) => {
    const nextSession = sessions.find((session) => session.sessionId === nextSessionId)
    if (nextSession === undefined) {
      return
    }

    const nextWorkspaceId = workspaceIdForCwd(nextSession.cwd)
    setWorkspaceId(nextWorkspaceId)
    setAgentId(nextSession.agentId)
    setSessionId(nextSession.sessionId)
    setTranscript(emptyTranscript)
    persistSelection({
      workspaceId: nextWorkspaceId,
      agentId: nextSession.agentId,
      sessionId: nextSession.sessionId,
    })
    selectSessionMutation.mutate(nextSessionId)
  }

  const handleStartNewSession = (selection: {
    workspaceId: string
    agentId: AgentId
  }) => {
    setWorkspaceId(selection.workspaceId)
    setAgentId(selection.agentId)
    setSessionId("")
    setTranscript(emptyTranscript)
    persistSelection({
      workspaceId: selection.workspaceId,
      agentId: selection.agentId,
      sessionId: "",
    })
  }

  const handleSend = (text: string) => {
    if (text.length === 0 || workspaceId === "" || agentId === "") {
      return
    }

    if (sessionId === "") {
      const workspace = workspaces.find((item) => item.id === workspaceId)
      if (workspace === undefined) {
        return
      }

      createSessionMutation.mutate(
        {
          agentId,
          cwd: workspace.path,
        },
        {
          onSuccess: (created) => {
            setSessionId(created.sessionId)
            setTranscript(emptyTranscript)
            persistSelection({
              workspaceId,
              agentId: created.agentId,
              sessionId: created.sessionId,
            })
            promptSessionMutation.mutate({
              sessionId: created.sessionId,
              body: { text },
            })
          },
        },
      )
      return
    }

    promptSessionMutation.mutate({
      sessionId,
      body: { text },
    })
  }

  const handleCancel = () => {
    if (sessionId === "") {
      return
    }
    cancelSessionMutation.mutate(sessionId)
  }

  const showWelcome = sessionId === "" && transcript.rows.length === 0

  useLayoutEffect(() => {
    if (showWelcome) {
      return
    }

    const container = transcriptScrollRef.current
    if (container !== null) {
      container.scrollTop = container.scrollHeight
      return
    }

    transcriptBottomRef.current?.scrollIntoView({ block: "end" })
  }, [showWelcome, transcript.rows, running, pendingPermissions.length])

  return (
    <div className="flex h-[calc(100vh-143px)] min-h-[600px] flex-col overflow-hidden rounded-[10px] border border-line-soft bg-panel max-[820px]:h-[calc(100vh-123px)] max-[820px]:min-h-[520px]">
      <ChatHeader
        workspaces={workspaces}
        agents={agents}
        sessions={sessions}
        workspaceId={workspaceId}
        agentId={agentId}
        sessionId={sessionId}
        selectedSession={selectedSession}
        selectedSessionState={effectiveSessionState}
        onJoinSession={handleJoinSession}
        onStartNewSession={handleStartNewSession}
        onSessionArchived={handleSessionArchived}
      />
      <div
        ref={transcriptScrollRef}
        className="flex-1 overflow-y-auto px-[max(25px,calc((100%-800px)/2))] py-[25px] [scrollbar-color:#252b34_transparent] max-[820px]:px-[13px] max-[820px]:py-[18px]"
      >
        {showWelcome ? (
          <WelcomeMessage />
        ) : (
          <>
            <ChatTranscript
              rows={transcript.rows}
              isRunning={running}
              hasPendingPermission={activePermission !== null}
            />
            <div ref={transcriptBottomRef} aria-hidden className="h-px w-full" />
          </>
        )}
      </div>
      <div className="px-5 pb-5 max-[820px]:px-2.5 max-[820px]:pb-2.5">
        {activePermission !== null ? (
          <PermissionPanel
            request={activePermission}
            submittingOptionId={submittingOptionId}
            onSelectOption={handlePermissionOption}
          />
        ) : null}
        <ChatComposer
          disabled={!composerEnabled}
          running={running}
          blockedMessage={blockedMessage}
          onSend={handleSend}
          onCancel={handleCancel}
        />
      </div>
    </div>
  )
}
