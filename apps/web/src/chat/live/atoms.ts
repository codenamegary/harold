import { atom } from "jotai"
import { AgentAuth } from "contracts/http/agent-auth"
import { SessionState } from "contracts/http/session"
import { emptyAcpTranscript, AcpTranscriptState } from "./acp.transcript.reducer"
import { AvailableCommand } from "./commands.available"
import { StreamExtension } from "./ExtensionPanel"
import { StreamPermission } from "./parse.permission"

export const transcriptAtom = atom<AcpTranscriptState>(emptyAcpTranscript)

/**
 * Most readers only care whether the session is idle, running, or blocked.
 * Subscribing here instead of to the transcript keeps them off the per-chunk
 * render path.
 */
export const sessionStateAtom = atom<SessionState | null>(
  (get) => get(transcriptAtom).sessionState,
)

export const permissionAtom = atom<StreamPermission | null>(null)

export const extensionAtom = atom<StreamExtension | null>(null)

export const streamAuthAtom = atom<AgentAuth | null>(null)

/** Prompt typed before a session existed. Sent once the stream subscribes. */
export const pendingPromptAtom = atom<string | null>(null)

/**
 * Slash commands the agent advertised for this session. The hub replays its
 * last copy to a joining client, so this fills before `subscribed`.
 */
export const availableCommandsAtom = atom<ReadonlyArray<AvailableCommand>>([])
