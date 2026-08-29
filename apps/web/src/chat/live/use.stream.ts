import { useEffect } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { useAtomValue, useSetAtom } from "jotai"
import { SessionStreamClientMessage } from "contracts/http/session.stream"
import { queryKeys } from "../../query/query.keys"
import { useSessionStream } from "../../session/use.session.stream"
import { selectionAtom } from "../selection/atoms"
import { applyReconnect } from "./acp.transcript.reducer"
import { clearLiveAtom, resetLiveAtom } from "./actions"
import { applyStreamMessageAtom } from "./stream.actions"

export type ChatStream = {
  send: (message: SessionStreamClientMessage) => void
}

export const useChatStream = (): ChatStream => {
  const queryClient = useQueryClient()
  const selection = useAtomValue(selectionAtom)
  const applyStreamMessage = useSetAtom(applyStreamMessageAtom)
  const clearLive = useSetAtom(clearLiveAtom)
  const resetLive = useSetAtom(resetLiveAtom)

  const stream = useSessionStream({
    agentId: selection.agentId === "" ? null : selection.agentId,
    sessionId: selection.sessionId === "" ? null : selection.sessionId,
    enabled: true,
    onReconnect: () => {
      clearLive(applyReconnect())
    },
    onMessage: (message) => {
      const effect = applyStreamMessage(message)

      switch (effect.kind) {
        case "none":
          return
        case "send-prompt":
          stream.send({
            type: "prompt",
            agentId: effect.agentId,
            sessionId: effect.sessionId,
            text: effect.text,
          })
          return
        case "refresh-auth":
          void queryClient.invalidateQueries({
            queryKey: queryKeys.agentSettingsRoot,
          })
          void queryClient.invalidateQueries({
            queryKey: queryKeys.agentAuth(effect.agentId),
          })
          return
      }
    },
  })

  // Atoms outlive this component, but the transcript only ever mirrors one
  // subscription. Without this the next subscribe replays history on top of
  // rows that are already there.
  useEffect(() => {
    return () => {
      resetLive()
    }
  }, [resetLive])

  return stream
}
