import React from "react"
import { useState } from "react"
import { AgentId } from "contracts/http/agent-settings"
import { Event } from "contracts/events/event"
import { useAgentSettingsQuery } from "../agent-settings/use.agent.settings.query"
import { useWorkspacesInfiniteQuery } from "../workspace/use.workspaces.infinite.query"
import { useSessionsQuery } from "../session/use.sessions.query"
import { useCreateSessionMutation } from "../session/use.create.session.mutation"
import { usePromptSessionMutation } from "../session/use.prompt.session.mutation"
import { useCancelSessionMutation } from "../session/use.cancel.session.mutation"
import { useSelectSessionMutation } from "../session/use.select.session.mutation"
import { useSessionEventStream } from "../session/use.session.event.stream"
import { ChatHeader } from "./ChatHeader"
import { WelcomeMessage } from "./WelcomeMessage"
import { ChatComposer } from "./ChatComposer"
import { ChatTranscript } from "./ChatTranscript"
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

export const ChatShell: React.FC = () => {
  const [workspaceId, setWorkspaceId] = useState("")
  const [agentId, setAgentId] = useState<AgentId | "">("")
  const [sessionId, setSessionId] = useState("")
  const [transcript, setTranscript] = useState<TranscriptState>(emptyTranscript)

  const workspacesQuery = useWorkspacesInfiniteQuery({})
  const agentsQuery = useAgentSettingsQuery()
  const sessionsQuery = useSessionsQuery(workspaceId === "" ? null : workspaceId)

  const createSessionMutation = useCreateSessionMutation()
  const promptSessionMutation = usePromptSessionMutation()
  const cancelSessionMutation = useCancelSessionMutation()
  const selectSessionMutation = useSelectSessionMutation()

  const workspaces =
    workspacesQuery.data?.pages.flatMap((page) => page.items) ?? []
  const agents = agentsQuery.data?.items ?? []
  const sessions = (sessionsQuery.data?.items ?? []).filter(
    (session) => session.state !== "archived" && session.archivedAt === null,
  )

  const handleEvents = (events: ReadonlyArray<Event>) => {
    setTranscript((current) => foldTranscriptEvents(current, events))
  }

  const handleReconnect = () => {
    setTranscript(emptyTranscript)
  }

  useSessionEventStream({
    sessionId: sessionId === "" ? null : sessionId,
    enabled: sessionId !== "",
    onEvents: handleEvents,
    onReconnect: handleReconnect,
  })

  const selectedSession = sessions.find((session) => session.id === sessionId)

  const handleSessionArchived = () => {
    setSessionId("")
    setTranscript(emptyTranscript)
  }
  const effectiveSessionState = resolveEffectiveSessionState({
    sessionId,
    transcriptSessionState: transcript.sessionState,
    listSessionState: selectedSession?.state,
  })
  const runningFromSession = effectiveSessionState === "running"
  const running =
    runningFromSession ||
    createSessionMutation.isPending ||
    promptSessionMutation.isPending

  const composerEnabled = isComposerPromptable({
    workspaceId,
    agentId,
    sessionId,
    sessionState: effectiveSessionState,
  })
  const blockedMessage = composerBlockedMessage(effectiveSessionState)

  const handleWorkspaceChange = (nextWorkspaceId: string) => {
    setWorkspaceId(nextWorkspaceId)
    setSessionId("")
    setTranscript(emptyTranscript)
  }

  const handleAgentChange = (nextAgentId: AgentId | "") => {
    setAgentId(nextAgentId)
    if (
      sessionId !== "" &&
      selectedSession !== undefined &&
      nextAgentId !== "" &&
      selectedSession.agentId !== nextAgentId
    ) {
      setSessionId("")
      setTranscript(emptyTranscript)
    }
  }

  const handleSessionChange = (nextSessionId: string) => {
    setSessionId(nextSessionId)
    setTranscript(emptyTranscript)
    if (nextSessionId === "") {
      return
    }

    const nextSession = sessions.find((session) => session.id === nextSessionId)
    if (nextSession !== undefined) {
      setAgentId(nextSession.agentId)
      selectSessionMutation.mutate(nextSessionId)
    }
  }

  const handleSend = (text: string) => {
    if (text.length === 0 || workspaceId === "" || agentId === "") {
      return
    }

    if (sessionId === "") {
      createSessionMutation.mutate(
        {
          workspaceId,
          agentId,
          text,
        },
        {
          onSuccess: (created) => {
            setSessionId(created.id)
            setTranscript(emptyTranscript)
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
        onWorkspaceChange={handleWorkspaceChange}
        onAgentChange={handleAgentChange}
        onSessionChange={handleSessionChange}
        onSessionArchived={handleSessionArchived}
      />
      <div className="flex-1 overflow-y-auto px-[max(25px,calc((100%-800px)/2))] py-[25px] [scrollbar-color:#252b34_transparent] max-[820px]:px-[13px] max-[820px]:py-[18px]">
        {showWelcome ? <WelcomeMessage /> : <ChatTranscript rows={transcript.rows} />}
      </div>
      <div className="px-5 pb-5 max-[820px]:px-2.5 max-[820px]:pb-2.5">
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
