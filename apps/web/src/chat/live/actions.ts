import { atom } from "jotai"
import { TranscriptAttachmentPreview } from "../transcript/rows"
import {
  applyPermissionResolved,
  beginUserTurn,
  emptyAcpTranscript,
  AcpTranscriptState,
} from "./acp.transcript.reducer"
import {
  availableCommandsAtom,
  extensionAtom,
  pendingPromptAtom,
  permissionAtom,
  streamAuthAtom,
  transcriptAtom,
} from "./atoms"

const noCommands: ReadonlyArray<never> = []

/**
 * Drops everything the current subscription produced. A queued prompt survives
 * so a reconnect can still deliver it.
 */
export const clearLiveAtom = atom(
  null,
  (_get, set, nextTranscript: AcpTranscriptState) => {
    set(transcriptAtom, nextTranscript)
    set(permissionAtom, null)
    set(extensionAtom, null)
    set(streamAuthAtom, null)
    set(availableCommandsAtom, noCommands)
  },
)

/** Clears live state and any queued prompt. Use when the subscription ends. */
export const resetLiveAtom = atom(null, (_get, set) => {
  set(clearLiveAtom, emptyAcpTranscript)
  set(pendingPromptAtom, null)
})

export const beginUserTurnAtom = atom(
  null,
  (
    get,
    set,
    params: {
      text: string
      attachments?: TranscriptAttachmentPreview[]
    },
  ) => {
    set(
      transcriptAtom,
      beginUserTurn(get(transcriptAtom), {
        turnId: crypto.randomUUID(),
        text: params.text,
        attachments: params.attachments,
      }),
    )
  },
)

/** First turn of a brand new session, so the transcript starts from empty. */
export const beginFirstUserTurnAtom = atom(
  null,
  (
    _get,
    set,
    params: {
      text: string
      attachments?: TranscriptAttachmentPreview[]
    },
  ) => {
    set(
      transcriptAtom,
      beginUserTurn(emptyAcpTranscript, {
        turnId: crypto.randomUUID(),
        text: params.text,
        attachments: params.attachments,
      }),
    )
  },
)

export const resolvePermissionAtom = atom(null, (get, set) => {
  set(permissionAtom, null)
  set(transcriptAtom, applyPermissionResolved(get(transcriptAtom)))
})
