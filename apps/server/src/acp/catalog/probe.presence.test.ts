import { describe, expect, test } from "bun:test"
import { WhichFn } from "../../agent-settings/resolve-agent-path"
import { PresenceProbeContext } from "./agent.profile.override"
import { probePresence } from "./probe.presence"

const createCtx = (
  whichMap: Record<string, string | undefined>,
  env: Record<string, string | undefined> = {},
): PresenceProbeContext => {
  const whichFn: WhichFn = (name) => whichMap[name]
  return { which: whichFn, env }
}

describe("probePresence", () => {
  test("uses cursor binaryName override for which(agent)", () => {
    const ctx = createCtx({ agent: "/usr/local/bin/agent", "cursor-agent": "/opt/cursor-agent" })

    expect(probePresence("cursor", ctx)).toEqual({
      present: true,
      path: "/usr/local/bin/agent",
    })
  })

  test("never treats npx spawn as present without an override", () => {
    const ctx = createCtx({ npx: "/usr/bin/npx" })

    expect(probePresence("autohand", ctx)).toEqual({
      present: false,
      path: null,
    })
  })

  test("never treats uvx spawn as present without an override", () => {
    const ctx = createCtx({ uvx: "/usr/bin/uvx" })

    expect(probePresence("fast-agent", ctx)).toEqual({
      present: false,
      path: null,
    })
  })

  test("defaults binary spawn to which(binaryName)", () => {
    const ctx = createCtx({ opencode: "/usr/local/bin/opencode" })

    expect(probePresence("opencode", ctx)).toEqual({
      present: true,
      path: "/usr/local/bin/opencode",
    })
  })

  test("claude-acp probes claude / CLAUDE_CODE_EXECUTABLE", () => {
    expect(
      probePresence("claude-acp", createCtx({ claude: "/usr/bin/claude" })),
    ).toEqual({
      present: true,
      path: "/usr/bin/claude",
    })

    expect(
      probePresence(
        "claude-acp",
        createCtx({}, { CLAUDE_CODE_EXECUTABLE: "/custom/claude" }),
      ),
    ).toEqual({
      present: true,
      path: "/custom/claude",
    })
  })

  test("codex-acp probes codex / CODEX_PATH", () => {
    expect(probePresence("codex-acp", createCtx({ codex: "/usr/bin/codex" }))).toEqual({
      present: true,
      path: "/usr/bin/codex",
    })

    expect(
      probePresence("codex-acp", createCtx({}, { CODEX_PATH: "/custom/codex" })),
    ).toEqual({
      present: true,
      path: "/custom/codex",
    })
  })

  test("curated popular adapters probe host binaries", () => {
    expect(probePresence("gemini", createCtx({ gemini: "/usr/bin/gemini" }))).toEqual({
      present: true,
      path: "/usr/bin/gemini",
    })
    expect(
      probePresence("github-copilot-cli", createCtx({ copilot: "/usr/bin/copilot" })),
    ).toEqual({
      present: true,
      path: "/usr/bin/copilot",
    })
    expect(probePresence("pi-acp", createCtx({ pi: "/usr/bin/pi" }))).toEqual({
      present: true,
      path: "/usr/bin/pi",
    })
    expect(probePresence("auggie", createCtx({ auggie: "/usr/bin/auggie" }))).toEqual({
      present: true,
      path: "/usr/bin/auggie",
    })
  })

  test("uses provided spawn for registry-ahead binary agents", () => {
    const ctx = createCtx({ "new-agent": "/usr/bin/new-agent" })

    expect(
      probePresence("new-agent", ctx, {
        kind: "binary",
        binaryName: "new-agent",
        command: ["new-agent", "acp"],
      }),
    ).toEqual({
      present: true,
      path: "/usr/bin/new-agent",
    })
  })

  test("registry-ahead npx without override is not present", () => {
    const ctx = createCtx({ npx: "/usr/bin/npx" })

    expect(
      probePresence("new-npx-agent", ctx, {
        kind: "npx",
        binaryName: "npx",
        command: ["npx", "new-npx-agent"],
      }),
    ).toEqual({
      present: false,
      path: null,
    })
  })
})
