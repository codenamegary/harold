import { execFile } from "node:child_process"
import { promisify } from "node:util"
import { AgentId } from "contracts/http/agent-settings"
import { AuthAdapter } from "./adapter"
import { createDefaultAuthAdapter, HOST_LOGIN_CONFIRM_STEP_ID } from "./default.adapter"

const execFileAsync = promisify(execFile)

const CURSOR_AGENT_IDS = new Set<AgentId>(["cursor"])

export type CursorAuthStatusJson = {
  status?: string
  isAuthenticated?: boolean
  error?: string
}

export const parseCursorAuthStatusJson = (stdout: string): CursorAuthStatusJson => {
  return JSON.parse(stdout) as CursorAuthStatusJson
}

export const mapCursorAuthStatus = (
  payload: CursorAuthStatusJson,
): { status: "authenticated" | "needs_auth" | "error"; error: string | null } => {
  if (payload.error !== undefined && payload.error.length > 0) {
    return { status: "error", error: payload.error }
  }
  if (payload.isAuthenticated === true || payload.status === "authenticated") {
    return { status: "authenticated", error: null }
  }
  return { status: "needs_auth", error: null }
}

export type CursorProbeDeps = {
  execFile: typeof execFileAsync
}

const defaultProbeDeps: CursorProbeDeps = {
  execFile: execFileAsync,
}

export const createCursorAuthAdapter = (deps: CursorProbeDeps = defaultProbeDeps): AuthAdapter => {
  const fallback = createDefaultAuthAdapter()

  return {
    id: "cursor",
    matches: (agentId) => CURSOR_AGENT_IDS.has(agentId),
    clientAuthCapabilities: () => ({
      _meta: { parameterizedModelPicker: true },
    }),
    hostLoginInstructions: (ctx) =>
      `Cursor is not signed in on this host (${ctx.hostMachineName}).\n\nOn the machine running Harold, open a terminal and run:\n  cursor-agent login\n\nWhen finished, tap I have logged in.`,
    probe: async (_ctx) => {
      try {
        const { stdout } = await deps.execFile("cursor-agent", ["status", "--format", "json"], {
          timeout: 10_000,
        })
        const mapped = mapCursorAuthStatus(parseCursorAuthStatusJson(stdout.trim()))
        return {
          status: mapped.status,
          error: mapped.error,
          canLogout: mapped.status === "authenticated",
        }
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : "Cursor auth probe failed"
        return {
          status: "unknown",
          error: message,
          canLogout: false,
        }
      }
    },
    onStart: async () => undefined,
    completionPolicy: "reconnect",
    start: async (ctx, input) => fallback.start(ctx, input),
    continue: async (ctx, input) => fallback.continue(ctx, input),
    abort: async (ctx, input) => fallback.abort(ctx, input),
    logout: async () => {
      await deps.execFile("cursor-agent", ["logout"], { timeout: 10_000 })
    },
  }
}

export const cursorAuthAdapter = createCursorAuthAdapter()

export { HOST_LOGIN_CONFIRM_STEP_ID }
