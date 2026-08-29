import { atom } from "jotai"
import { SessionStreamServerMessage } from "contracts/http/session.stream"
import { ChatSelection } from "../selection/persist"
import { selectionAtom } from "../selection/atoms"
import { parseAcpUpdate } from "./acp.update"
import {
  applyCancelled,
  applyPermissionRequested,
  applyPromptComplete,
  applyStreamError,
  applySubscribed,
  emptyAcpTranscript,
  foldAcpUpdate,
  AcpTranscriptState,
} from "./acp.transcript.reducer"
import { parseStreamPermission } from "./parse.permission"
import {
  extensionAtom,
  pendingPromptAtom,
  permissionAtom,
  streamAuthAtom,
  submittingExtensionAtom,
  submittingOptionIdAtom,
  transcriptAtom,
} from "./atoms"

const belongsToSelection = (
  selection: ChatSelection,
  frame: { agentId: string; sessionId: string },
): boolean =>
  frame.sessionId === selection.sessionId && frame.agentId === selection.agentId

export const clearLiveAtom = atom(
  null,
  (_get, set, nextTranscript: AcpTranscriptState = emptyAcpTranscript) => {
    set(transcriptAtom, nextTranscript)
    set(permissionAtom, null)
    set(extensionAtom, null)
    set(streamAuthAtom, null)
    set(submittingOptionIdAtom, null)
    set(submittingExtensionAtom, false)
  },
)

export const applyStreamMessageAtom = atom(
  null,
  (get, set, message: SessionStreamServerMessage) => {
    const selection = get(selectionAtom)

    switch (message.type) {
      case "session_update": {
        if (!belongsToSelection(selection, message)) {
          return
        }
        set(
          transcriptAtom,
          foldAcpUpdate(get(transcriptAtom), parseAcpUpdate(message.update)),
        )
        return
      }
      case "subscribed": {
        if (!belongsToSelection(selection, message)) {
          return
        }
        set(transcriptAtom, applySubscribed(get(transcriptAtom)))
        return
      }
      case "prompt_complete": {
        if (!belongsToSelection(selection, message)) {
          return
        }
        set(transcriptAtom, applyPromptComplete(get(transcriptAtom)))
        return
      }
      case "cancelled": {
        if (!belongsToSelection(selection, message)) {
          return
        }
        set(transcriptAtom, applyCancelled(get(transcriptAtom)))
        return
      }
      case "permission_request": {
        if (!belongsToSelection(selection, message)) {
          return
        }
        const parsed = parseStreamPermission({
          requestId: message.requestId,
          params: message.params,
        })
        if (parsed === null) {
          return
        }
        set(permissionAtom, parsed)
        set(transcriptAtom, applyPermissionRequested(get(transcriptAtom)))
        return
      }
      case "extension_request": {
        if (!belongsToSelection(selection, message)) {
          return
        }
        set(extensionAtom, {
          requestId: message.requestId,
          method: message.method,
          params: message.params,
        })
        return
      }
      case "error": {
        if (
          message.sessionId !== undefined &&
          message.sessionId !== selection.sessionId
        ) {
          return
        }
        set(transcriptAtom, applyStreamError(get(transcriptAtom)))
        return
      }
      case "auth_session_updated": {
        if (message.agentId !== selection.agentId) {
          return
        }
        set(streamAuthAtom, message.auth)
        return
      }
    }
  },
)

export const switchSelectionAtom = atom(
  null,
  (_get, set, next: ChatSelection) => {
    set(pendingPromptAtom, null)
    set(clearLiveAtom, emptyAcpTranscript)
    set(selectionAtom, next)
  },
)
