import { useAtomValue, useStore } from "jotai"
import { AgentIdSchema } from "contracts/http/agent-settings"
import { SessionStreamClientMessage } from "contracts/http/session.stream"
import { useCreateSessionMutation } from "../../session/use.create.session.mutation"
import { useWorkspacesInfiniteQuery } from "../../workspace/use.workspaces.infinite.query"
import { selectionAtom } from "../selection/atoms"
import { commitSelectionAtom } from "../selection/actions"
import {
  composerBlockedMessage,
  isComposerPromptable,
  resolveEffectiveSessionState,
} from "../selection/promptability"
import { pendingPromptAtom, transcriptAtom } from "./atoms"
import { beginUserTurn, emptyAcpTranscript } from "./acp.transcript.reducer"
import { ChatStream } from "./use.stream"

type UseChatPromptResult = {
  send: (text: string) => void
  cancel: () => void
  running: boolean
  composerEnabled: boolean
  blockedMessage: string | null
}

export const useChatPrompt = (stream: ChatStream): UseChatPromptResult => {
  const store = useStore()
  const selection = useAtomValue(selectionAtom)
  const transcript = useAtomValue(transcriptAtom)
  const workspacesQuery = useWorkspacesInfiniteQuery({})
  const createSessionMutation = useCreateSessionMutation()
  const workspaces =
    workspacesQuery.data?.pages.flatMap((page) => page.items) ?? []

  const effectiveSessionState = resolveEffectiveSessionState({
    sessionId: selection.sessionId,
    transcriptSessionState: transcript.sessionState,
    listSessionState: undefined,
  })
  const runningFromSession =
    effectiveSessionState === "running" ||
    effectiveSessionState === "awaiting-permission"
  const running = runningFromSession || createSessionMutation.isPending
  const composerEnabled = isComposerPromptable({
    workspaceId: selection.workspaceId,
    agentId: selection.agentId,
    sessionId: selection.sessionId,
    sessionState: effectiveSessionState,
  })
  const blockedMessage = composerBlockedMessage(effectiveSessionState)

  const sendStream = (message: SessionStreamClientMessage) => {
    stream.send(message)
  }

  const send = (text: string) => {
    if (text.length === 0 || selection.workspaceId === "" || selection.agentId === "") {
      return
    }

    const parsedAgent = AgentIdSchema.safeParse(selection.agentId)
    if (!parsedAgent.success) {
      return
    }

    if (selection.sessionId === "") {
      const workspace = workspaces.find((item) => item.id === selection.workspaceId)
      if (workspace === undefined) {
        return
      }

      store.set(pendingPromptAtom, text)
      createSessionMutation.mutate(
        {
          agentId: parsedAgent.data,
          cwd: workspace.path,
        },
        {
          onSuccess: (created) => {
            store.set(commitSelectionAtom, {
              workspaceId: selection.workspaceId,
              agentId: created.agentId,
              sessionId: created.sessionId,
            })
            store.set(
              transcriptAtom,
              beginUserTurn(emptyAcpTranscript, {
                turnId: crypto.randomUUID(),
                text,
              }),
            )
          },
        },
      )
      return
    }

    store.set(
      transcriptAtom,
      beginUserTurn(store.get(transcriptAtom), {
        turnId: crypto.randomUUID(),
        text,
      }),
    )
    sendStream({
      type: "prompt",
      agentId: parsedAgent.data,
      sessionId: selection.sessionId,
      text,
    })
  }

  const cancel = () => {
    if (selection.sessionId === "") {
      return
    }
    const parsedAgent = AgentIdSchema.safeParse(selection.agentId)
    if (!parsedAgent.success) {
      return
    }
    sendStream({
      type: "cancel",
      agentId: parsedAgent.data,
      sessionId: selection.sessionId,
    })
  }

  return {
    send,
    cancel,
    running,
    composerEnabled,
    blockedMessage,
  }
}
