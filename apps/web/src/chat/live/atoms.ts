import { atom } from "jotai"
import { AgentAuth } from "contracts/http/agent-auth"
import { emptyAcpTranscript, AcpTranscriptState } from "./acp.transcript.reducer"
import { StreamExtension } from "./ExtensionPanel"
import { StreamPermission } from "./parse.permission"

export const transcriptAtom = atom<AcpTranscriptState>(emptyAcpTranscript)

export const permissionAtom = atom<StreamPermission | null>(null)

export const extensionAtom = atom<StreamExtension | null>(null)

export const streamAuthAtom = atom<AgentAuth | null>(null)

export const submittingOptionIdAtom = atom<string | null>(null)

export const submittingExtensionAtom = atom(false)

export const pendingPromptAtom = atom<string | null>(null)
