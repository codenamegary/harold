import React from "react"
import { useEffect, useLayoutEffect, useRef, useState } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { AgentAuth } from "contracts/http/agent-auth"
import { AgentId, AgentIdSchema } from "contracts/http/agent-settings"
import { SessionStreamClientMessage } from "contracts/http/session.stream"
import { AgentAuthPanel } from "../agent/auth/AgentAuthPanel"
import { useAgentAuthQuery } from "../agent/auth/use.agent.auth"
import { useAgentSettingsQuery } from "../agent-settings/use.agent.settings.query"
import { useWorkspacesInfiniteQuery } from "../workspace/use.workspaces.infinite.query"
import { queryKeys } from "../query/query.keys"
import { useSessionsQuery } from "../session/use.sessions.query"
import { useCreateSessionMutation } from "../session/use.create.session.mutation"
import { useSessionStream } from "../session/use.session.stream"
import { ChatHeader } from "./ChatHeader"
import { WelcomeMessage } from "./WelcomeMessage"
import { ChatComposer } from "./ChatComposer"
import { ChatTranscript } from "./ChatTranscript"
import { PermissionPanel } from "./PermissionPanel"
import { ExtensionPanel, StreamExtension } from "./ExtensionPanel"
import { parseAcpUpdate } from "./acp.update"
import {
  applyCancelled,
  applyPermissionRequested,
  applyPermissionResolved,
  applyPromptComplete,
  applyReconnect,
  applyStreamError,
  applySubscribed,
  beginUserTurn,
  emptyAcpTranscript,
  foldAcpUpdate,
  AcpTranscriptState,
} from "./acp.transcript.reducer"
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
import { parseStreamPermission, StreamPermission } from "../permission/parse.stream.permission"

export const ChatShell: React.FC = () => {
  const [workspaceId, setWorkspaceId] = useState("")
  const [agentId, setAgentId] = useState("")
  const [sessionId, setSessionId] = useState("")
  const [transcript, setTranscript] = useState<AcpTranscriptState>(emptyAcpTranscript)
  const [pendingPermission, setPendingPermission] = useState<StreamPermission | null>(null)
  const [pendingExtension, setPendingExtension] = useState<StreamExtension | null>(null)
  const [streamAgentAuth, setStreamAgentAuth] = useState<AgentAuth | null>(null)
  const [submittingOptionId, setSubmittingOptionId] = useState<string | null>(null)
  const [submittingExtension, setSubmittingExtension] = useState(false)
  const hasAttemptedResume = useRef(false)
  const pendingPromptRef = useRef<string | null>(null)
  const transcriptScrollRef = useRef<HTMLDivElement>(null)
  const transcriptBottomRef = useRef<HTMLDivElement>(null)
  const queryClient = useQueryClient()

  const workspacesQuery = useWorkspacesInfiniteQuery({})
  const agentsQuery = useAgentSettingsQuery()
  const sessionsQuery = useSessionsQuery()

  const createSessionMutation = useCreateSessionMutation()

  const workspaces =
    workspacesQuery.data?.pages.flatMap((page) => page.items) ?? []
  const agents = agentsQuery.data?.items ?? []
  const sessions = sessionsQuery.data?.items ?? []
  const parsedAgentId = AgentIdSchema.safeParse(agentId)
  const selectedAgent = agents.find((agent) => agent.id === agentId)
  const hydrateAuthQuery = useAgentAuthQuery(
    parsedAgentId.success && selectedAgent?.authSummary.activeSessionId !== null
      ? parsedAgentId.data
      : null,
    { pollWhileSessionActive: true },
  )
  const agentAuth = streamAgentAuth ?? hydrateAuthQuery.data ?? null

  const workspaceIdForCwd = (cwd: string) =>
    workspaces.find((workspace) => workspace.path === cwd)?.id ?? ""

  const persistSelection = (next: {
    workspaceId: string
    agentId: string
    sessionId: string
  }) => {
    writeChatSelection(next)
  }

  const clearLiveState = (nextTranscript: AcpTranscriptState = emptyAcpTranscript) => {
    setTranscript(nextTranscript)
    setPendingPermission(null)
    setPendingExtension(null)
    setStreamAgentAuth(null)
    setSubmittingOptionId(null)
    setSubmittingExtension(false)
  }

  const stream = useSessionStream({
    agentId: agentId === "" ? null : agentId,
    sessionId: sessionId === "" ? null : sessionId,
    enabled: true,
    onReconnect: () => {
      clearLiveState(applyReconnect())
    },
    onMessage: (message) => {
      const belongsToSelection = (frame: { agentId: string; sessionId: string }) =>
        frame.sessionId === sessionId && frame.agentId === agentId

      switch (message.type) {
        case "session_update": {
          if (!belongsToSelection(message)) {
            return
          }
          setTranscript((current) =>
            foldAcpUpdate(current, parseAcpUpdate(message.update)),
          )
          return
        }
        case "subscribed": {
          if (!belongsToSelection(message)) {
            return
          }
          setTranscript((current) => applySubscribed(current))
          const queued = pendingPromptRef.current
          if (queued === null) {
            return
          }
          pendingPromptRef.current = null
          const parsedAgent = AgentIdSchema.safeParse(message.agentId)
          if (!parsedAgent.success) {
            return
          }
          stream.send({
            type: "prompt",
            agentId: parsedAgent.data,
            sessionId: message.sessionId,
            text: queued,
          })
          return
        }
        case "prompt_complete": {
          if (!belongsToSelection(message)) {
            return
          }
          setTranscript((current) => applyPromptComplete(current))
          return
        }
        case "cancelled": {
          if (!belongsToSelection(message)) {
            return
          }
          setTranscript((current) => applyCancelled(current))
          return
        }
        case "permission_request": {
          if (!belongsToSelection(message)) {
            return
          }
          const parsed = parseStreamPermission({
            requestId: message.requestId,
            params: message.params,
          })
          if (parsed === null) {
            return
          }
          setPendingPermission(parsed)
          setTranscript((current) => applyPermissionRequested(current))
          return
        }
        case "extension_request": {
          if (!belongsToSelection(message)) {
            return
          }
          setPendingExtension({
            requestId: message.requestId,
            method: message.method,
            params: message.params,
          })
          return
        }
        case "error": {
          if (
            message.sessionId !== undefined &&
            message.sessionId !== sessionId
          ) {
            return
          }
          setTranscript((current) => applyStreamError(current))
          return
        }
        case "auth_session_updated": {
          if (message.agentId !== agentId) {
            return
          }
          setStreamAgentAuth(message.auth)
          void queryClient.invalidateQueries({ queryKey: queryKeys.agentSettingsRoot })
          void queryClient.invalidateQueries({
            queryKey: queryKeys.agentAuth(message.agentId),
          })
          return
        }
      }
    },
  })

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
    const matched = sessionItems.find(
      (session) =>
        session.sessionId === saved.sessionId && session.agentId === saved.agentId,
    )
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
  }, [
    sessionsQuery.data?.items,
    sessionsQuery.isError,
    sessionsQuery.isLoading,
    workspacesQuery.data?.pages,
  ])

  useEffect(() => {
    const refetchCatalog = () => {
      void sessionsQuery.refetch()
    }

    window.addEventListener("focus", refetchCatalog)
    return () => {
      window.removeEventListener("focus", refetchCatalog)
    }
  }, [sessionsQuery])

  const selectedSession = sessions.find(
    (session) => session.sessionId === sessionId && session.agentId === agentId,
  )

  const effectiveSessionState = resolveEffectiveSessionState({
    sessionId,
    transcriptSessionState: transcript.sessionState,
    listSessionState: undefined,
  })
  const runningFromSession =
    effectiveSessionState === "running" ||
    effectiveSessionState === "awaiting-permission"
  const running = runningFromSession || createSessionMutation.isPending

  const sendStream = (message: SessionStreamClientMessage) => {
    stream.send(message)
  }

  const handlePermissionOption = (optionId: string) => {
    if (pendingPermission === null) {
      return
    }

    setSubmittingOptionId(optionId)
    sendStream({
      type: "permission_reply",
      requestId: pendingPermission.requestId,
      optionId,
    })
    setPendingPermission(null)
    setSubmittingOptionId(null)
    setTranscript((current) => applyPermissionResolved(current))
  }

  const handleExtensionReply = (result: unknown) => {
    if (pendingExtension === null) {
      return
    }

    setSubmittingExtension(true)
    sendStream({
      type: "extension_reply",
      requestId: pendingExtension.requestId,
      result,
    })
    setPendingExtension(null)
    setSubmittingExtension(false)
  }

  const composerEnabled = isComposerPromptable({
    workspaceId,
    agentId,
    sessionId,
    sessionState: effectiveSessionState,
  })
  const blockedMessage = composerBlockedMessage(effectiveSessionState)

  const handleJoinSession = (next: { agentId: string; sessionId: string }) => {
    const nextSession = sessions.find(
      (session) =>
        session.sessionId === next.sessionId && session.agentId === next.agentId,
    )
    if (nextSession === undefined) {
      return
    }

    const nextWorkspaceId = workspaceIdForCwd(nextSession.cwd)
    setWorkspaceId(nextWorkspaceId)
    setAgentId(nextSession.agentId)
    setSessionId(nextSession.sessionId)
    pendingPromptRef.current = null
    clearLiveState()
    persistSelection({
      workspaceId: nextWorkspaceId,
      agentId: nextSession.agentId,
      sessionId: nextSession.sessionId,
    })
  }

  const handleStartNewSession = (selection: {
    workspaceId: string
    agentId: AgentId
  }) => {
    setWorkspaceId(selection.workspaceId)
    setAgentId(selection.agentId)
    setSessionId("")
    pendingPromptRef.current = null
    clearLiveState()
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

    const parsedAgent = AgentIdSchema.safeParse(agentId)
    if (!parsedAgent.success) {
      return
    }

    if (sessionId === "") {
      const workspace = workspaces.find((item) => item.id === workspaceId)
      if (workspace === undefined) {
        return
      }

      pendingPromptRef.current = text
      createSessionMutation.mutate(
        {
          agentId: parsedAgent.data,
          cwd: workspace.path,
        },
        {
          onSuccess: (created) => {
            setSessionId(created.sessionId)
            setAgentId(created.agentId)
            setTranscript(
              beginUserTurn(emptyAcpTranscript, {
                turnId: crypto.randomUUID(),
                text,
              }),
            )
            persistSelection({
              workspaceId,
              agentId: created.agentId,
              sessionId: created.sessionId,
            })
          },
        },
      )
      return
    }

    setTranscript((current) =>
      beginUserTurn(current, {
        turnId: crypto.randomUUID(),
        text,
      }),
    )
    sendStream({
      type: "prompt",
      agentId: parsedAgent.data,
      sessionId,
      text,
    })
  }

  const handleCancel = () => {
    if (sessionId === "") {
      return
    }
    const parsedAgent = AgentIdSchema.safeParse(agentId)
    if (!parsedAgent.success) {
      return
    }
    sendStream({
      type: "cancel",
      agentId: parsedAgent.data,
      sessionId,
    })
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
  }, [showWelcome, transcript.rows, running, pendingPermission, pendingExtension])

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-panel">
      <div className="shrink-0">
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
          onSessionMenuOpen={() => {
            void sessionsQuery.refetch()
          }}
        />
      </div>
      <div
        ref={transcriptScrollRef}
        className="min-h-0 flex-1 overflow-y-auto px-[max(25px,calc((100%-800px)/2))] py-[25px] [scrollbar-color:#252b34_transparent] max-[820px]:px-[13px] max-[820px]:py-[18px]"
      >
        {showWelcome ? (
          <WelcomeMessage />
        ) : (
          <>
            <ChatTranscript
              rows={transcript.rows}
              isRunning={running}
              hasPendingPermission={pendingPermission !== null}
            />
            <div ref={transcriptBottomRef} aria-hidden className="h-px w-full" />
          </>
        )}
      </div>
      <div className="shrink-0 px-5 pb-5 max-[820px]:px-2.5 max-[820px]:pb-2.5">
        {agentAuth !== null &&
        agentAuth.session !== null &&
        agentAuth.session.status === "in_progress" &&
        AgentIdSchema.safeParse(agentId).success ? (
          <AgentAuthPanel
            agentId={AgentIdSchema.parse(agentId)}
            agentName={
              agents.find((agent) => agent.id === agentId)?.displayName ?? agentId
            }
            summary={{
              status: agentAuth.status,
              error: agentAuth.error,
              activeSessionId: agentAuth.session.sessionId,
              canLogout:
                agents.find((agent) => agent.id === agentId)?.authSummary.canLogout ??
                false,
            }}
            auth={agentAuth}
            compact
          />
        ) : null}
        {pendingPermission !== null ? (
          <PermissionPanel
            request={pendingPermission}
            submittingOptionId={submittingOptionId}
            onSelectOption={handlePermissionOption}
          />
        ) : null}
        {pendingExtension !== null ? (
          <ExtensionPanel
            request={pendingExtension}
            submitting={submittingExtension}
            onReply={handleExtensionReply}
            onSkip={() => {
              handleExtensionReply({ outcome: { outcome: "skipped" } })
            }}
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
