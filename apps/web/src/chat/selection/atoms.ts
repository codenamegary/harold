import { atom } from "jotai"
import { ChatSelection } from "./persist"

export const emptySelection: ChatSelection = {
  workspaceId: "",
  agentId: "",
  sessionId: "",
}

export const selectionAtom = atom<ChatSelection>(emptySelection)
