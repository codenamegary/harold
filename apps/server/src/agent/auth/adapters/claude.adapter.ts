import { execFile } from "node:child_process"
import { promisify } from "node:util"
import { AgentId } from "contracts/http/agent-settings"
import { AuthAdapter } from "./adapter"
import { createDefaultAuthAdapter, HOST_LOGIN_CONFIRM_STEP_ID } from "./default.adapter"

const execFileAsync = promisify(execFile)

const CLAUDE_AGENT_IDS = new Set<AgentId>(["claude-acp"])

export type ClaudeAuthStatusJson = {
  loggedIn?: boolean
  error?: string
}

export const parseClaudeAuthStatusJson = (stdout: string): ClaudeAuthStatusJson => {
  return JSON.parse(stdout) as ClaudeAuthStatusJson
}

export const mapClaudeAuthStatus = (
  payload: ClaudeAuthStatusJson,
): { status: "authenticated" | "needs_auth" | "error"; error: string | null } => {
  if (payload.error !== undefined && payload.error.length > 0) {
    return { status: "error", error: payload.error }
  }
  if (payload.loggedIn === true) {
    return { status: "authenticated", error: null }
  }
  return { status: "needs_auth", error: null }
}

export type ClaudeProbeDeps = {
  execFile: typeof execFileAsync
}

const defaultProbeDeps: ClaudeProbeDeps = {
  execFile: execFileAsync,
}

export const createClaudeAuthAdapter = (
  deps: ClaudeProbeDeps = defaultProbeDeps,
): AuthAdapter => {
  const fallback = createDefaultAuthAdapter()

  return {
    id: "claude",
    matches: (agentId) => CLAUDE_AGENT_IDS.has(agentId),
    clientAuthCapabilities: fallback.clientAuthCapabilities,
    hostLoginInstructions: (ctx) =>
      `Claude is not signed in on this host (${ctx.hostMachineName}).\n\nOn the machine running Agent Server, open a terminal and run:\n  claude auth login\n\nWhen finished, tap I have logged in.`,
    probe: async (_ctx) => {
      try {
        const { stdout } = await deps.execFile("claude", ["auth", "status", "--json"], {
          timeout: 10_000,
        })
        const mapped = mapClaudeAuthStatus(parseClaudeAuthStatusJson(stdout.trim()))
        return {
          status: mapped.status,
          error: mapped.error,
          canLogout: mapped.status === "authenticated",
        }
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : "Claude auth probe failed"
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
      await deps.execFile("claude", ["auth", "logout"], { timeout: 10_000 })
    },
  }
}

export const claudeAuthAdapter = createClaudeAuthAdapter()

export { HOST_LOGIN_CONFIRM_STEP_ID }
