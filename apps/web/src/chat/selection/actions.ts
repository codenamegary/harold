import { atom } from "jotai"
import { resetLiveAtom } from "../live/actions"
import { selectionAtom } from "./atoms"
import { ChatSelection, writeChatSelection } from "./persist"

/**
 * The operator moved to a different session. Anything the old subscription
 * produced, including a queued prompt, no longer applies.
 */
export const selectSessionAtom = atom(null, (_get, set, next: ChatSelection) => {
  set(resetLiveAtom)
  set(selectionAtom, next)
  writeChatSelection(next)
})

/**
 * We learned the ids for work already in flight (resume from storage, or a
 * session that was just created for a prompt). Live state stays.
 */
export const adoptSessionAtom = atom(null, (_get, set, next: ChatSelection) => {
  set(selectionAtom, next)
  writeChatSelection(next)
})
