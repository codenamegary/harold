import { useQueryClient } from "@tanstack/react-query"
import { useAtomValue, useStore } from "jotai"
import { AgentIdSchema } from "contracts/http/agent-settings"
import { SessionStreamClientMessage } from "contracts/http/session.stream"
import { queryKeys } from "../../query/query.keys"
import { useSessionStream } from "../../session/use.session.stream"
import { selectionAtom } from "../selection/atoms"
import { pendingPromptAtom } from "./atoms"
import { applyReconnect } from "./acp.transcript.reducer"
import { applyStreamMessageAtom, clearLiveAtom } from "./stream.actions"

export type ChatStream = {
  send: (message: SessionStreamClientMessage) => void
}

export const useChatStream = (): ChatStream => {
  const store = useStore()
  const queryClient = useQueryClient()
  const selection = useAtomValue(selectionAtom)

  const stream = useSessionStream({
    agentId: selection.agentId === "" ? null : selection.agentId,
    sessionId: selection.sessionId === "" ? null : selection.sessionId,
    enabled: true,
    onReconnect: () => {
      store.set(clearLiveAtom, applyReconnect())
    },
    onMessage: (message) => {
      store.set(applyStreamMessageAtom, message)

      if (message.type === "auth_session_updated") {
        if (message.agentId !== store.get(selectionAtom).agentId) {
          return
        }
        void queryClient.invalidateQueries({ queryKey: queryKeys.agentSettingsRoot })
        void queryClient.invalidateQueries({
          queryKey: queryKeys.agentAuth(message.agentId),
        })
        return
      }

      if (message.type !== "subscribed") {
        return
      }

      const current = store.get(selectionAtom)
      if (
        message.sessionId !== current.sessionId ||
        message.agentId !== current.agentId
      ) {
        return
      }

      const queued = store.get(pendingPromptAtom)
      if (queued === null) {
        return
      }
      store.set(pendingPromptAtom, null)
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
    },
  })

  return stream
}
