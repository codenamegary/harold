import { ListGitWorktrees } from "core/git/worktrees.usecase"
import {
  ForgetSessionWorktreePath,
  GetSessionWorktreePath,
  SessionWorktreePathKey,
  SetSessionWorktreePath,
} from "./session.ports"
import {
  parseSessionWorktreePathCandidate,
  SessionWorktreePathCandidate,
  SessionWorktreePathCandidateKind,
  sessionWorktreePathCandidateKind,
} from "./session.worktree.path.candidates"

export type SessionWorktreePathTracker = {
  startTurn: (ref: SessionWorktreePathKey) => void
  observeUpdate: (params: SessionWorktreePathKey & { update: unknown }) => void
  finishTurn: (
    params: SessionWorktreePathKey & { cwd: string },
  ) => Promise<{ worktreePath: string | null } | null>
  forget: (ref: SessionWorktreePathKey) => void
}

export type CreateSessionWorktreePathTrackerParams = {
  listWorktrees: ListGitWorktrees
  getSessionWorktreePath: GetSessionWorktreePath
  setSessionWorktreePath: SetSessionWorktreePath
  forgetSessionWorktreePath: ForgetSessionWorktreePath
  pathExists: (path: string) => boolean
  now: () => string
  log: (params: { error: unknown; message: string }) => void
}

type CandidateState = {
  active: boolean
  candidates: Map<string, SessionWorktreePathCandidate & { sequence: number }>
  kinds: Map<string, SessionWorktreePathCandidateKind>
}

const stateKey = (ref: SessionWorktreePathKey): string => `${ref.agentId}\0${ref.sessionId}`

const matchesWorktree = (candidate: string, worktreePath: string): boolean =>
  candidate === worktreePath || candidate.startsWith(`${worktreePath}/`)

export const createSessionWorktreePathTracker = ({
  listWorktrees,
  getSessionWorktreePath,
  setSessionWorktreePath,
  forgetSessionWorktreePath,
  pathExists,
  now,
  log,
}: CreateSessionWorktreePathTrackerParams): SessionWorktreePathTracker => {
  const states = new Map<string, CandidateState>()
  let nextSequence = 0

  return {
    startTurn: (ref) => {
      states.set(stateKey(ref), { active: true, candidates: new Map(), kinds: new Map() })
    },
    observeUpdate: ({ update, ...ref }) => {
      const state = states.get(stateKey(ref))
      if (state === undefined || !state.active) {
        return
      }

      const toolCallId = readToolCallId(update)
      if (toolCallId === undefined) {
        return
      }

      const declaredKind = sessionWorktreePathCandidateKind(update)
      if (declaredKind !== undefined) {
        state.kinds.set(toolCallId, declaredKind)
      }

      const parsed = parseSessionWorktreePathCandidate(
        update,
        declaredKind ?? state.kinds.get(toolCallId),
      )
      if (parsed === null) {
        return
      }

      state.candidates.set(parsed.toolCallId, {
        ...parsed,
        sequence: ++nextSequence,
      })
    },
    finishTurn: async ({ cwd, ...ref }) => {
      const key = stateKey(ref)
      const state = states.get(key)
      if (state === undefined) {
        return null
      }
      states.delete(key)

      try {
        const stored = getSessionWorktreePath(ref)
        const storedMissing = stored !== undefined && !pathExists(stored)
        if (storedMissing) {
          forgetSessionWorktreePath(ref)
        }

        if (state.candidates.size === 0) {
          return storedMissing ? { worktreePath: null } : null
        }

        const listed = await listWorktrees({ path: cwd })
        if (!listed.ok) {
          log({
            error: listed.error,
            message: "session worktree path detection could not list worktrees",
          })
          return storedMissing ? { worktreePath: null } : null
        }

        const candidates = [...state.candidates.values()].sort(
          (left, right) => left.sequence - right.sequence,
        )
        const worktreePath = candidates
          .toReversed()
          .map(
            (candidate) =>
              listed.value.items
                .filter((worktree) => matchesWorktree(candidate.path, worktree.path))
                .sort((left, right) => right.path.length - left.path.length)[0],
          )
          .find((worktree) => worktree !== undefined)?.path
        if (worktreePath === undefined) {
          return storedMissing ? { worktreePath: null } : null
        }

        if (worktreePath === stored) {
          return null
        }

        setSessionWorktreePath({ ...ref, worktreePath, updatedAt: now() })
        return { worktreePath }
      } catch (error: unknown) {
        log({ error, message: "session worktree path detection failed" })
        return null
      }
    },
    forget: (ref) => {
      states.delete(stateKey(ref))
    },
  }
}

const readToolCallId = (update: unknown): string | undefined => {
  if (typeof update !== "object" || update === null) {
    return undefined
  }
  const value = (update as Record<string, unknown>)["toolCallId"]
  return typeof value === "string" && value.length > 0 ? value : undefined
}
