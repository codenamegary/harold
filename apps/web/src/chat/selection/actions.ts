import { atom } from "jotai"
import { ChatSelection, writeChatSelection } from "./persist"
import { selectionAtom } from "./atoms"
import { switchSelectionAtom } from "../live/stream.actions"

export const commitSelectionAtom = atom(
  null,
  (_get, set, next: ChatSelection) => {
    set(selectionAtom, next)
    writeChatSelection(next)
  },
)

export const replaceSelectionAtom = atom(
  null,
  (_get, set, next: ChatSelection) => {
    set(switchSelectionAtom, next)
    writeChatSelection(next)
  },
)
