import React, { useRef } from "react"
import { useAtomValue } from "jotai"
import { AgentIdSchema } from "contracts/http/agent-settings"
import { AgentAuthPanel } from "../agent/auth/AgentAuthPanel"
import { useAgentAuthQuery } from "../agent/auth/use.agent.auth"
import { useAgentSettingsQuery } from "../agent-settings/use.agent.settings.query"
import {
  supportsFileAttachments,
  supportsImageAttachments,
} from "./composer/capabilities"
import { ChatComposer, ChatComposerConfig } from "./composer/ChatComposer"
import { ChatHeader } from "./header/ChatHeader"
import { streamAuthAtom, transcriptAtom } from "./live/atoms"
import { useChatAttachments } from "./live/use.attachments"
import { ExtensionPanel } from "./live/ExtensionPanel"
import { PermissionPanel } from "./live/PermissionPanel"
import { useTranscriptAutoscroll } from "./live/use.autoscroll"
import { useSessionConfig } from "./config/use.session.config"
import { useChatPrompt } from "./live/use.prompt"
import { useLiveReplies } from "./live/use.replies"
import { useChatStream } from "./live/use.stream"
import { useChatResume } from "./selection/use.resume"
import { selectionAtom } from "./selection/atoms"
import { ChatTranscript } from "./transcript/ChatTranscript"
import { WelcomeMessage } from "./transcript/WelcomeMessage"

export const ChatShell: React.FC = () => {
  const selection = useAtomValue(selectionAtom)
  const transcript = useAtomValue(transcriptAtom)
  const streamAgentAuth = useAtomValue(streamAuthAtom)
  const transcriptScrollRef = useRef<HTMLDivElement>(null)
  const transcriptBottomRef = useRef<HTMLDivElement>(null)

  useChatResume()
  const stream = useChatStream()
  const chatAttachments = useChatAttachments({ workspaceId: selection.workspaceId })
  const { send, cancel, running, composerEnabled, blockedMessage } =
    useChatPrompt(stream, chatAttachments)
  const { permission, extension, replyToPermission, replyToExtension } =
    useLiveReplies(stream)
  const sessionConfig = useSessionConfig()

  const composerConfig: ChatComposerConfig | undefined =
    sessionConfig.model === undefined
    && sessionConfig.mode === undefined
    && sessionConfig.thinking === undefined
      ? undefined
      : {
          ...(sessionConfig.model === undefined ? {} : { model: sessionConfig.model }),
          ...(sessionConfig.mode === undefined ? {} : { mode: sessionConfig.mode }),
          ...(sessionConfig.thinking === undefined ? {} : { thinking: sessionConfig.thinking }),
          ...(sessionConfig.error === null ? {} : { error: sessionConfig.error }),
          onModelPick: (value) => {
            if (sessionConfig.model !== undefined) {
              sessionConfig.setOption({ configId: sessionConfig.model.id, value })
            }
          },
          onModeCycle: (next) => {
            if (sessionConfig.mode !== undefined) {
              sessionConfig.setOption({ configId: sessionConfig.mode.id, value: next })
            }
          },
          onThinkingCycle: (next) => {
            if (sessionConfig.thinking !== undefined) {
              sessionConfig.setOption({ configId: sessionConfig.thinking.id, value: next })
            }
          },
        }

  const agentsQuery = useAgentSettingsQuery()
  const agents = agentsQuery.data?.items ?? []
  const parsedAgentId = AgentIdSchema.safeParse(selection.agentId)
  const selectedAgent = agents.find((agent) => agent.id === selection.agentId)
  const hydrateAuthQuery = useAgentAuthQuery(
    parsedAgentId.success && selectedAgent?.authSummary.activeSessionId !== null
      ? parsedAgentId.data
      : null,
    { pollWhileSessionActive: true },
  )
  const agentAuth = streamAgentAuth ?? hydrateAuthQuery.data ?? null

  const showWelcome = selection.sessionId === "" && transcript.rows.length === 0
  useTranscriptAutoscroll({
    showWelcome,
    running,
    scrollRef: transcriptScrollRef,
    bottomRef: transcriptBottomRef,
  })

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-panel">
      <div className="shrink-0">
        <ChatHeader />
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
              hasPendingPermission={permission !== null}
            />
            <div ref={transcriptBottomRef} aria-hidden className="h-px w-full" />
          </>
        )}
      </div>
      <div className="shrink-0 px-5 pb-5 max-[820px]:px-2.5 max-[820px]:pb-2.5">
        {agentAuth !== null &&
        agentAuth.session !== null &&
        agentAuth.session.status === "in_progress" &&
        AgentIdSchema.safeParse(selection.agentId).success ? (
          <div className="relative mx-auto mb-3 w-[min(840px,calc(100%-40px))] max-[820px]:w-[calc(100%-20px)]">
            <AgentAuthPanel
              agentId={AgentIdSchema.parse(selection.agentId)}
              agentName={
                agents.find((agent) => agent.id === selection.agentId)?.displayName ??
                selection.agentId
              }
              summary={{
                status: agentAuth.status,
                error: agentAuth.error,
                activeSessionId: agentAuth.session.sessionId,
                canLogout:
                  agents.find((agent) => agent.id === selection.agentId)?.authSummary
                    .canLogout ?? false,
              }}
              auth={agentAuth}
              compact
            />
          </div>
        ) : null}
        {permission !== null ? (
          <PermissionPanel request={permission} onSelectOption={replyToPermission} />
        ) : null}
        {extension !== null ? (
          <ExtensionPanel
            request={extension}
            onReply={replyToExtension}
            onSkip={() => {
              replyToExtension({ outcome: { outcome: "skipped" } })
            }}
          />
        ) : null}
        <ChatComposer
          disabled={!composerEnabled}
          running={running}
          blockedMessage={blockedMessage}
          supportsImages={supportsImageAttachments(selectedAgent?.capabilities)}
          supportsFiles={supportsFileAttachments(selectedAgent?.capabilities)}
          attachments={chatAttachments.attachments}
          onFilesPicked={chatAttachments.addFiles}
          onRemoveAttachment={chatAttachments.remove}
          onRetryAttachment={chatAttachments.retry}
          onSend={send}
          onCancel={cancel}
          config={composerConfig}
        />
      </div>
    </div>
  )
}
