import { describe, expect, test } from "bun:test"
import { createVfsStore } from "./vfs.store"
import { createVirtualGit } from "./git.virtual"
import { CAT_WORKTREE_ROOT, seedVfsAndRepos } from "./seed.data"
import { createAcpAgentRunner, createAgentSessionStore } from "./acp.agent"

type JsonRpcMessage = {
  jsonrpc: "2.0"
  id?: number | string
  method?: string
  params?: Record<string, unknown>
  result?: Record<string, unknown>
  error?: { code: number; message: string }
}

const createHarness = () => {
  const vfs = createVfsStore({ home: "/home/demo" })
  const repos = seedVfsAndRepos(vfs)
  const git = createVirtualGit(vfs, repos)
  const sessionStore = createAgentSessionStore()
  const outbound: Array<JsonRpcMessage> = []

  const agent = createAcpAgentRunner({
    agentId: "opencode",
    vfs,
    git,
    sessionStore,
    timing: { charDelayMs: 0, toolDelayMs: 0 },
    emit: (msg) => {
      outbound.push(msg as JsonRpcMessage)
    },
  })

  return { agent, outbound, git, vfs }
}

describe("acp.agent", () => {
  test("initializes, lists seeded sessions, and replays session/load", async () => {
    const { agent, outbound } = createHarness()

    await agent.handleLine(JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize", params: {} }))
    const initResp = outbound.find((m) => m.id === 1)
    expect(initResp?.result?.protocolVersion).toBe(1)

    await agent.handleLine(
      JSON.stringify({ jsonrpc: "2.0", id: 2, method: "session/list", params: {} }),
    )
    const listResp = outbound.find((m) => m.id === 2)
    const sessions = listResp?.result?.sessions as Array<{ sessionId: string }>
    expect(sessions.length).toBeGreaterThanOrEqual(2)

    await agent.handleLine(
      JSON.stringify({
        jsonrpc: "2.0",
        id: 3,
        method: "session/load",
        params: { sessionId: sessions[0]?.sessionId },
      }),
    )
    const loadResp = outbound.find((m) => m.id === 3)
    expect(loadResp?.result?.configOptions).toBeDefined()
    expect(
      outbound.some(
        (m) =>
          m.method === "session/update" &&
          (m.params?.update as Record<string, unknown>)?.sessionUpdate === "user_message_chunk",
      ),
    ).toBe(true)
  })

  test("advances through the 3-turn linear script regardless of prompt text", async () => {
    const { agent, outbound, git } = createHarness()

    await agent.handleLine(
      JSON.stringify({
        jsonrpc: "2.0",
        id: 10,
        method: "session/new",
        params: { cwd: CAT_WORKTREE_ROOT },
      }),
    )
    const sessionId = (outbound.find((m) => m.id === 10)?.result?.sessionId as string) ?? ""
    expect(sessionId).toContain("ses_demo_opencode_")

    // Turn 1: Plan + Elicitation
    await agent.handleLine(
      JSON.stringify({
        jsonrpc: "2.0",
        id: 11,
        method: "session/prompt",
        params: { sessionId, prompt: [{ type: "text", text: "anything at all" }] },
      }),
    )
    const elicitationReq = outbound.find((m) => m.method === "elicitation/create")
    expect(elicitationReq).toBeDefined()

    // Client answers elicitation
    await agent.handleLine(
      JSON.stringify({
        jsonrpc: "2.0",
        id: elicitationReq?.id,
        result: { action: "accept", content: { mode: "settings-toggle" } },
      }),
    )
    const turn1Done = outbound.find((m) => m.id === 11)
    expect(turn1Done?.result?.stopReason).toBe("end_turn")

    // Turn 2: Build + live uncommitted git changes + usage
    await agent.handleLine(
      JSON.stringify({
        jsonrpc: "2.0",
        id: 12,
        method: "session/prompt",
        params: { sessionId, prompt: [{ type: "text", text: "next step" }] },
      }),
    )
    const turn2Done = outbound.find((m) => m.id === 12)
    expect(turn2Done?.result?.stopReason).toBe("end_turn")
    const statusAfterTurn2 = git.run(CAT_WORKTREE_ROOT, ["status", "--porcelain=v1", "-uall"]).stdout
    expect(statusAfterTurn2).toContain(" M src/settings.js")
    expect(statusAfterTurn2).toContain("?? src/cat-mode.js")
    expect(
      outbound.some(
        (m) =>
          m.method === "session/update" &&
          (m.params?.update as Record<string, unknown>)?.sessionUpdate === "usage_update",
      ),
    ).toBe(true)

    // Turn 3: Commit + PR
    await agent.handleLine(
      JSON.stringify({
        jsonrpc: "2.0",
        id: 13,
        method: "session/prompt",
        params: { sessionId, prompt: [{ type: "text", text: "finish it" }] },
      }),
    )
    const turn3Done = outbound.find((m) => m.id === 13)
    expect(turn3Done?.result?.stopReason).toBe("end_turn")
    expect(git.run(CAT_WORKTREE_ROOT, ["status", "--porcelain=v1", "-uall"]).stdout).toBe("")

    // Turn 4: Wrap-up
    await agent.handleLine(
      JSON.stringify({
        jsonrpc: "2.0",
        id: 14,
        method: "session/prompt",
        params: { sessionId, prompt: [{ type: "text", text: "one more" }] },
      }),
    )
    const turn4Done = outbound.find((m) => m.id === 14)
    expect(turn4Done?.result?.stopReason).toBe("end_turn")
  })
})
