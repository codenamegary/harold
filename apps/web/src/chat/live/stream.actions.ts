import { atom, Getter, Setter } from "jotai"
import { AgentId } from "contracts/http/agent-settings"
import { AttachmentReference } from "contracts/http/attachments"
import { SessionConfig } from "contracts/http/config.options"
import { SessionStreamServerMessage } from "contracts/http/session.stream"
import { ChatSelection } from "../selection/persist"
import { selectionAtom } from "../selection/atoms"
import { configErrorBySessionAtom, pendingConfigBySessionAtom, sessionConfigBySessionAtom } from "../config/atoms"
import { parseAcpUpdate } from "./acp.update"
import { parseAvailableCommands } from "./commands.available"
import {
  applyCancelled,
  applyPermissionRequested,
  applyPromptComplete,
  applyStreamError,
  applySubscribed,
  foldAcpUpdate,
} from "./acp.transcript.reducer"
import { parseStreamPermission } from "./parse.permission"
import {
  availableCommandsAtom,
  extensionAtom,
  pendingPromptAtom,
  permissionAtom,
  streamAuthAtom,
  transcriptAtom,
} from "./atoms"

/**
 * Work the caller must perform after state has been applied. Keeping it out of
 * the atom leaves the socket and the query cache to the hook that owns them.
 */
export type StreamEffect =
  | { kind: "none" }
  | {
      kind: "send-prompt"
      agentId: AgentId
      sessionId: string
      text: string
      attachments?: ReadonlyArray<AttachmentReference>
    }
  | { kind: "refresh-auth"; agentId: AgentId }

const noEffect: StreamEffect = { kind: "none" }

const belongsToSelection = (
  selection: ChatSelection,
  frame: { agentId: string; sessionId: string },
): boolean =>
  frame.sessionId === selection.sessionId && frame.agentId === selection.agentId

/**
 * Whole-array replace of the session's config state. A pending optimistic set
 * survives until a frame confirms it: the confirming option carries the
 * pending value as the authoritative currentValue. A confirming frame also
 * clears any config error for the session.
 */
const setSessionConfig = (
  get: Getter,
  set: Setter,
  sessionId: string,
  configOptions: SessionConfig,
) => {
  set(sessionConfigBySessionAtom, (current) => {
    const next = new Map(current)
    next.set(sessionId, configOptions)
    return next
  })

  const pending = get(pendingConfigBySessionAtom).get(sessionId)
  if (pending !== undefined) {
    const confirmed = configOptions.some(
      (option) => option.id === pending.configId && option.currentValue === pending.value,
    )
    if (confirmed) {
      set(pendingConfigBySessionAtom, (current) => {
        const next = new Map(current)
        next.delete(sessionId)
        return next
      })
      set(configErrorBySessionAtom, (current) => {
        const next = new Map(current)
        next.delete(sessionId)
        return next
      })
    }
  } else {
    set(configErrorBySessionAtom, (current) => {
      const next = new Map(current)
      next.delete(sessionId)
      return next
    })
  }
}

export const applyStreamMessageAtom = atom(
  null,
  (get, set, message: SessionStreamServerMessage): StreamEffect => {
    const selection = get(selectionAtom)

    switch (message.type) {
      case "session_update": {
        if (!belongsToSelection(selection, message)) {
          return noEffect
        }
        const commands = parseAvailableCommands(message.update)
        if (commands !== null) {
          set(availableCommandsAtom, commands)
          return noEffect
        }
        set(
          transcriptAtom,
          foldAcpUpdate(get(transcriptAtom), parseAcpUpdate(message.update)),
        )
        return noEffect
      }
      case "session_config": {
        if (!belongsToSelection(selection, message)) {
          return noEffect
        }
        setSessionConfig(get, set, message.sessionId, message.configOptions)
        return noEffect
      }
      case "subscribed": {
        if (!belongsToSelection(selection, message)) {
          return noEffect
        }
        set(transcriptAtom, applySubscribed(get(transcriptAtom)))

        const queued = get(pendingPromptAtom)
        if (queued === null) {
          return noEffect
        }
        set(pendingPromptAtom, null)
        return {
          kind: "send-prompt",
          agentId: message.agentId,
          sessionId: message.sessionId,
          text: queued.text,
          ...(queued.attachments !== undefined && queued.attachments.length > 0
            ? { attachments: queued.attachments }
            : {}),
        }
      }
      case "prompt_complete": {
        if (!belongsToSelection(selection, message)) {
          return noEffect
        }
        set(transcriptAtom, applyPromptComplete(get(transcriptAtom)))
        return noEffect
      }
      case "cancelled": {
        if (!belongsToSelection(selection, message)) {
          return noEffect
        }
        set(transcriptAtom, applyCancelled(get(transcriptAtom)))
        return noEffect
      }
      case "permission_request": {
        if (!belongsToSelection(selection, message)) {
          return noEffect
        }
        const parsed = parseStreamPermission({
          requestId: message.requestId,
          params: message.params,
        })
        if (parsed === null) {
          return noEffect
        }
        set(permissionAtom, parsed)
        set(transcriptAtom, applyPermissionRequested(get(transcriptAtom)))
        return noEffect
      }
      case "extension_request": {
        if (!belongsToSelection(selection, message)) {
          return noEffect
        }
        set(extensionAtom, {
          requestId: message.requestId,
          method: message.method,
          params: message.params,
        })
        return noEffect
      }
      case "error": {
        if (
          message.sessionId !== undefined &&
          message.sessionId !== selection.sessionId
        ) {
          return noEffect
        }
        set(transcriptAtom, applyStreamError(get(transcriptAtom)))
        return noEffect
      }
      case "auth_session_updated": {
        if (message.agentId !== selection.agentId) {
          return noEffect
        }
        set(streamAuthAtom, message.auth)
        return { kind: "refresh-auth", agentId: message.agentId }
      }
    }
  },
)
