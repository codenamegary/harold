import { useAtomValue, useSetAtom } from "jotai"
import { AgentIdSchema } from "contracts/http/agent-settings"
import { useCreateSessionMutation } from "../../session/use.create.session.mutation"
import { useWorkspacesInfiniteQuery } from "../../workspace/use.workspaces.infinite.query"
import { adoptSessionAtom } from "../selection/actions"
import { selectionAtom } from "../selection/atoms"
import {
  composerBlockedMessage,
  isComposerPromptable,
  resolveEffectiveSessionState,
} from "../selection/promptability"
import { beginFirstUserTurnAtom, beginUserTurnAtom } from "./actions"
import { pendingPromptAtom, sessionStateAtom } from "./atoms"
import { ChatStream } from "./use.stream"

type UseChatPromptResult = {
  send: (text: string) => void
  cancel: () => void
  running: boolean
  composerEnabled: boolean
  blockedMessage: string | null
}

export const useChatPrompt = (stream: ChatStream): UseChatPromptResult => {
  const selection = useAtomValue(selectionAtom)
  const transcriptSessionState = useAtomValue(sessionStateAtom)
  const setPendingPrompt = useSetAtom(pendingPromptAtom)
  const adoptSession = useSetAtom(adoptSessionAtom)
  const beginUserTurn = useSetAtom(beginUserTurnAtom)
  const beginFirstUserTurn = useSetAtom(beginFirstUserTurnAtom)
  const workspacesQuery = useWorkspacesInfiniteQuery({})
  const createSessionMutation = useCreateSessionMutation()
  const workspaces =
    workspacesQuery.data?.pages.flatMap((page) => page.items) ?? []

  const effectiveSessionState = resolveEffectiveSessionState({
    sessionId: selection.sessionId,
    transcriptSessionState,
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

      // Held until the stream subscribes to the session we are about to create.
      setPendingPrompt(text)
      createSessionMutation.mutate(
        {
          agentId: parsedAgent.data,
          cwd: workspace.path,
        },
        {
          onSuccess: (created) => {
            adoptSession({
              workspaceId: selection.workspaceId,
              agentId: created.agentId,
              sessionId: created.sessionId,
            })
            beginFirstUserTurn(text)
          },
        },
      )
      return
    }

    beginUserTurn(text)
    stream.send({
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
    stream.send({
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
