import { z } from "zod"
import { VirtualGit } from "./git.virtual"
import {
  AGENT_NAMES,
  CAT_WORKTREE_ROOT,
  createSeededSessions,
  NEW_CAT_MODE_JS,
  NEW_CAT_MODE_TEST_JS,
  SeededMessage,
  SeededSession,
  UPDATED_SETTINGS_JS,
} from "./seed.data"
import { VfsStore } from "./vfs.store"

type ElicitationQuestion = {
  sessionId: string
  toolCallId: string
  message: string
  mode: "form"
  requestedSchema: {
    type: "object"
    properties: {
      mode: {
        type: "string"
        title: string
        oneOf: ReadonlyArray<{ const: string; title: string }>
      }
    }
    required: ReadonlyArray<string>
  }
}

type SessionRecord = {
  sessionId: string
  cwd: string
  title: string
  updatedAt: string
  turnIndex: number
  history: Array<SeededMessage>
  pendingQuestion?: ElicitationQuestion
  usage?: {
    used: number
    size: number
    cost: { amount: number; currency: string }
  }
}

export type AgentSessionStore = {
  getSessions: (agentId: string) => Array<SessionRecord>
}

export const createAgentSessionStore = (): AgentSessionStore => {
  const byAgent = new Map<string, Array<SessionRecord>>()
  return {
    getSessions: (agentId: string) => {
      const existing = byAgent.get(agentId)
      if (existing) {
        return existing
      }
      const seeded: Array<SessionRecord> = createSeededSessions(agentId).map(
        (s: SeededSession) => ({
          ...s,
          history: [...s.history],
        }),
      )
      byAgent.set(agentId, seeded)
      return seeded
    },
  }
}

type AcpTiming = {
  charDelayMs: number
  toolDelayMs: number
}

export type AcpAgentRunnerDeps = {
  agentId: string
  vfs: VfsStore
  git: VirtualGit
  sessionStore: AgentSessionStore
  timing?: AcpTiming
  emit: (message: Record<string, unknown>) => void
}

const DEFAULT_TIMING: AcpTiming = {
  charDelayMs: 8,
  toolDelayMs: 120,
}

const PLAN_TEXT = `Here is the plan:

1. Add \`catMode\` to the defaults and settings controls in \`src/settings.js\`.
2. Add the wandering-cat state loop in \`src/cat-mode.js\`.
3. Add unit tests in \`test/cat-mode.test.js\`.

One choice before I build:`

const BUILD_SUMMARY = `Cat mode is implemented in the working tree:

- \`src/cat-mode.js\` adds Mia's wandering loop.
- \`src/settings.js\` adds the Cat mode toggle.
- \`test/cat-mode.test.js\` covers the state step.

Check the **Changes** tab to inspect the live uncommitted git diff, then send any follow-up to commit and open the PR.`

const PR_SUMMARY = `Committed 3 files on \`feat/cat-mode\` and opened a draft PR:

https://github.com/codenamegary/cat-screensaver/pull/42`

const WRAP_UP_TEXT =
  "Demo transcript complete. Start a new session or reconnect to replay from the beginning."

const CONFIG_OPTIONS = [
  {
    type: "select",
    id: "model",
    name: "Model",
    category: "model",
    currentValue: "deepseek/deepseek-flash",
    options: [
      { value: "deepseek/deepseek-flash", name: "DeepSeek V4.1 Flash" },
      { value: "anthropic/claude-sonnet-4-5", name: "Claude Sonnet 4.5" },
      { value: "openai/gpt-5.2-codex", name: "GPT-5.2 Codex" },
    ],
  },
  {
    type: "select",
    id: "mode",
    name: "Mode",
    category: "mode",
    currentValue: "build",
    options: [
      { value: "build", name: "Build" },
      { value: "plan", name: "Plan" },
    ],
  },
  {
    type: "select",
    id: "thought_level",
    name: "Thinking",
    category: "thought_level",
    currentValue: "medium",
    options: [
      { value: "low", name: "Thinking: Low" },
      { value: "medium", name: "Thinking: Medium" },
      { value: "high", name: "Thinking: High" },
    ],
  },
]

const RpcMessageSchema = z.object({
  jsonrpc: z.string().optional(),
  id: z.union([z.number(), z.string()]).optional(),
  method: z.string().optional(),
  params: z.record(z.string(), z.unknown()).optional(),
  result: z.record(z.string(), z.unknown()).optional(),
})

const sleep = (ms: number): Promise<void> =>
  ms <= 0 ? Promise.resolve() : new Promise((resolve) => setTimeout(resolve, ms))

export const createAcpAgentRunner = (deps: AcpAgentRunnerDeps) => {
  const timing = deps.timing ?? DEFAULT_TIMING
  const config = structuredClone(CONFIG_OPTIONS)
  const pendingElicitations = new Map<
    number | string,
    { sessionId: string; promptId: number | string | undefined; question: ElicitationQuestion }
  >()
  const state = { nextRequestId: 9000 }

  const nowIso = (): string => new Date().toISOString()

  const respond = (id: number | string | undefined, result: Record<string, unknown>): void => {
    if (id === undefined) {
      return
    }
    deps.emit({ jsonrpc: "2.0", id, result })
  }

  const respondError = (
    id: number | string | undefined,
    code: number,
    message: string,
  ): void => {
    if (id === undefined) {
      return
    }
    deps.emit({ jsonrpc: "2.0", id, error: { code, message } })
  }

  const notifyUpdate = (sessionId: string, update: Record<string, unknown>): void => {
    deps.emit({
      jsonrpc: "2.0",
      method: "session/update",
      params: { sessionId, update },
    })
  }

  const emitText = async (
    sessionId: string,
    text: string,
    options?: { thought?: boolean; chunked?: boolean },
  ): Promise<void> => {
    const kind = options?.thought ? "agent_thought_chunk" : "agent_message_chunk"
    const chunked = options?.chunked ?? true
    const chunkSize = chunked ? 24 : Math.max(text.length, 1)
    for (const start of Array.from(
      { length: Math.ceil(text.length / chunkSize) },
      (_, idx) => idx * chunkSize,
    )) {
      const piece = text.slice(start, start + chunkSize)
      notifyUpdate(sessionId, {
        sessionUpdate: kind,
        content: { type: "text", text: piece },
      })
      if (chunked && timing.charDelayMs > 0) {
        await sleep(timing.charDelayMs)
      }
    }
  }

  const emitTool = async (
    sessionId: string,
    toolCallId: string,
    title: string,
    kind: string,
  ): Promise<void> => {
    notifyUpdate(sessionId, {
      sessionUpdate: "tool_call",
      toolCallId,
      title,
      kind,
      status: "in_progress",
    })
    await sleep(timing.toolDelayMs)
    notifyUpdate(sessionId, {
      sessionUpdate: "tool_call_update",
      toolCallId,
      status: "completed",
    })
  }

  const findSession = (sessionId: string): SessionRecord | undefined =>
    deps.sessionStore.getSessions(deps.agentId).find((s) => s.sessionId === sessionId)

  const handleTurn1 = async (
    session: SessionRecord,
    promptId: number | string | undefined,
  ): Promise<void> => {
    session.title = "Cat mode for the screensaver"
    notifyUpdate(session.sessionId, {
      sessionUpdate: "session_info_update",
      title: session.title,
      updatedAt: nowIso(),
    })
    await emitText(session.sessionId, "Let me inspect the current settings and canvas code.", {
      thought: true,
    })
    await emitTool(session.sessionId, "tool-plan-settings", "src/settings.js", "read")
    await emitTool(session.sessionId, "tool-plan-main", "src/main.js", "read")
    await emitText(session.sessionId, PLAN_TEXT)
    session.history.push({ role: "assistant", text: PLAN_TEXT })
    session.turnIndex = 1
    session.updatedAt = nowIso()

    const question: ElicitationQuestion = {
      sessionId: session.sessionId,
      toolCallId: "tool-plan-question",
      message: "One choice before I build.",
      mode: "form",
      requestedSchema: {
        type: "object",
        properties: {
          mode: {
            type: "string",
            title: "How should cat mode turn on?",
            oneOf: [
              { const: "settings-toggle", title: "Settings toggle" },
              { const: "automatic", title: "Automatic" },
            ],
          },
        },
        required: ["mode"],
      },
    }
    session.pendingQuestion = question
    const requestId = state.nextRequestId
    state.nextRequestId += 1
    pendingElicitations.set(requestId, { sessionId: session.sessionId, promptId, question })
    deps.emit({
      jsonrpc: "2.0",
      id: requestId,
      method: "elicitation/create",
      params: question,
    })
  }

  const handleTurn2 = async (
    session: SessionRecord,
    promptId: number | string | undefined,
  ): Promise<void> => {
    const targetRepo = deps.git.findRepoRoot(session.cwd) ?? CAT_WORKTREE_ROOT
    await emitText(
      session.sessionId,
      "I will update settings.js, add cat-mode.js, and write tests.",
      { thought: true },
    )
    await emitTool(session.sessionId, "tool-build-settings", "src/settings.js", "edit")
    deps.vfs.writeFile(`${targetRepo}/src/settings.js`, Buffer.from(UPDATED_SETTINGS_JS))

    await emitTool(session.sessionId, "tool-build-cat", "src/cat-mode.js", "edit")
    deps.vfs.writeFile(`${targetRepo}/src/cat-mode.js`, Buffer.from(NEW_CAT_MODE_JS))

    await emitTool(session.sessionId, "tool-build-test", "test/cat-mode.test.js", "edit")
    deps.vfs.writeFile(`${targetRepo}/test/cat-mode.test.js`, Buffer.from(NEW_CAT_MODE_TEST_JS))

    await emitTool(session.sessionId, "tool-build-run", "bun test", "execute")

    const usage = {
      used: 64200,
      size: 1000000,
      cost: { amount: 0.016, currency: "USD" },
    }
    session.usage = usage
    notifyUpdate(session.sessionId, { sessionUpdate: "usage_update", ...usage })

    await emitText(session.sessionId, BUILD_SUMMARY)
    session.history.push({ role: "assistant", text: BUILD_SUMMARY })
    session.turnIndex = 2
    session.updatedAt = nowIso()
    respond(promptId, { stopReason: "end_turn" })
  }

  const handleTurn3 = async (
    session: SessionRecord,
    promptId: number | string | undefined,
  ): Promise<void> => {
    const targetRepo = deps.git.findRepoRoot(session.cwd) ?? CAT_WORKTREE_ROOT
    await emitText(session.sessionId, "Committing changes and opening a draft PR.", {
      thought: true,
    })
    await emitTool(session.sessionId, "tool-pr-commit", "git commit -m 'Add cat mode'", "execute")
    deps.git.commitAll(targetRepo, "Add cat mode")
    await emitTool(session.sessionId, "tool-pr-open", "gh pr create --draft", "execute")

    await emitText(session.sessionId, PR_SUMMARY)
    session.history.push({ role: "assistant", text: PR_SUMMARY })
    session.turnIndex = 3
    session.updatedAt = nowIso()
    respond(promptId, { stopReason: "end_turn" })
  }

  const handleElicitationResponse = async (
    id: number | string,
    result: Record<string, unknown> | undefined,
  ): Promise<void> => {
    const pending = pendingElicitations.get(id)
    if (!pending) {
      return
    }
    pendingElicitations.delete(id)
    const session = findSession(pending.sessionId)
    if (!session) {
      respond(pending.promptId, { stopReason: "end_turn" })
      return
    }
    delete session.pendingQuestion
    const content = (result?.content ?? {}) as Record<string, unknown>
    const rawValue = String(content.mode ?? content.choice ?? "settings-toggle")
    const option = pending.question.requestedSchema.properties.mode.oneOf.find(
      (o) => o.const === rawValue,
    )
    const label = option?.title ?? rawValue
    const reply = `${label} it is. Send any follow-up message and I'll apply the edits so you can inspect the git diff.`
    session.history.push({ role: "user", text: label })
    session.history.push({ role: "assistant", text: reply })
    session.updatedAt = nowIso()
    await emitText(session.sessionId, reply)
    respond(pending.promptId, { stopReason: "end_turn" })
  }

  const handleLine = async (line: string): Promise<void> => {
    const trimmed = line.trim()
    if (!trimmed) {
      return
    }
    const parsed = RpcMessageSchema.safeParse(JSON.parse(trimmed))
    if (!parsed.success) {
      return
    }
    const msg = parsed.data
    if (!msg.method) {
      if (msg.id !== undefined) {
        await handleElicitationResponse(msg.id, msg.result)
      }
      return
    }

    const params = msg.params ?? {}
    const id = msg.id

    if (msg.method === "initialize") {
      respond(id, {
        protocolVersion: 1,
        agentCapabilities: {
          loadSession: true,
          promptCapabilities: { image: true, embeddedContext: true },
          sessionCapabilities: { list: {}, delete: {}, resume: {} },
        },
        authMethods: [],
        agentInfo: {
          name: AGENT_NAMES[deps.agentId] ?? deps.agentId,
          version: "demo",
        },
      })
      return
    }

    if (msg.method === "session/new") {
      const cwd = typeof params.cwd === "string" && params.cwd ? params.cwd : deps.vfs.home
      const sessions = deps.sessionStore.getSessions(deps.agentId)
      const sessionId = `ses_demo_${deps.agentId.replace(/[^a-z0-9]/gi, "_")}_${String(
        sessions.length + 1,
      ).padStart(4, "0")}`
      sessions.push({
        sessionId,
        cwd,
        title: "New session",
        updatedAt: nowIso(),
        turnIndex: 0,
        history: [],
      })
      respond(id, { sessionId, configOptions: config })
      return
    }

    if (msg.method === "session/list") {
      const cwdFilter = typeof params.cwd === "string" ? params.cwd : undefined
      const all = [...deps.sessionStore.getSessions(deps.agentId)]
        .filter((s) => !cwdFilter || s.cwd === cwdFilter)
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      respond(id, {
        sessions: all.map((s) => ({
          sessionId: s.sessionId,
          cwd: s.cwd,
          title: s.title,
          updatedAt: s.updatedAt,
        })),
      })
      return
    }

    if (msg.method === "session/load") {
      const sessionId = String(params.sessionId ?? "")
      const session = findSession(sessionId)
      if (!session) {
        respondError(id, -32002, `Unknown session: ${sessionId}`)
        return
      }
      for (const entry of session.history) {
        if (entry.role === "user") {
          notifyUpdate(sessionId, {
            sessionUpdate: "user_message_chunk",
            content: { type: "text", text: entry.text },
          })
        } else {
          await emitText(sessionId, entry.text, { chunked: false })
        }
      }
      if (session.usage) {
        notifyUpdate(sessionId, { sessionUpdate: "usage_update", ...session.usage })
      }
      if (session.pendingQuestion) {
        const requestId = state.nextRequestId
        state.nextRequestId += 1
        pendingElicitations.set(requestId, {
          sessionId,
          promptId: undefined,
          question: session.pendingQuestion,
        })
        deps.emit({
          jsonrpc: "2.0",
          id: requestId,
          method: "elicitation/create",
          params: session.pendingQuestion,
        })
      }
      respond(id, { configOptions: config })
      return
    }

    if (msg.method === "session/delete") {
      const sessionId = String(params.sessionId ?? "")
      const sessions = deps.sessionStore.getSessions(deps.agentId)
      const idx = sessions.findIndex((s) => s.sessionId === sessionId)
      if (idx >= 0) {
        sessions.splice(idx, 1)
      }
      respond(id, {})
      return
    }

    if (msg.method === "session/set_config_option") {
      const configId = params.configId
      const value = params.value
      for (const option of config) {
        if (option.id === configId && typeof value === "string") {
          option.currentValue = value
        }
      }
      respond(id, { configOptions: config })
      return
    }

    if (msg.method === "session/cancel") {
      return
    }

    if (msg.method === "session/prompt") {
      const sessionId = String(params.sessionId ?? "")
      const session = findSession(sessionId)
      if (!session) {
        respondError(id, -32002, `Unknown session: ${sessionId}`)
        return
      }
      const promptBlocks = Array.isArray(params.prompt) ? params.prompt : []
      const userText = promptBlocks
        .filter(
          (b): b is { type: string; text: string } =>
            typeof b === "object" &&
            b !== null &&
            (b as Record<string, unknown>).type === "text" &&
            typeof (b as Record<string, unknown>).text === "string",
        )
        .map((b) => b.text)
        .join("\n")
      session.history.push({ role: "user", text: userText })
      session.updatedAt = nowIso()

      if (session.turnIndex === 0) {
        await handleTurn1(session, id)
        return
      }
      if (session.turnIndex === 1) {
        await handleTurn2(session, id)
        return
      }
      if (session.turnIndex === 2) {
        await handleTurn3(session, id)
        return
      }
      await emitText(session.sessionId, WRAP_UP_TEXT)
      session.history.push({ role: "assistant", text: WRAP_UP_TEXT })
      respond(id, { stopReason: "end_turn" })
      return
    }

    respondError(id, -32601, `Method not found: ${msg.method}`)
  }

  return { handleLine }
}
