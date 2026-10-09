import { afterEach, describe, expect, test } from "bun:test"
import { mkdtempSync, rmSync } from "node:fs"
import os from "node:os"
import path from "node:path"
import { AgentId } from "contracts/http/agent-settings"
import { createDefaultAuthAdapter } from "server/agent/auth/adapters/default.adapter"
import { AgentCli, disableAgent, enableAgent, openAgentCli } from "./agent.command"
import { renderAgentList, renderAgentProbe } from "./agent.render"

type AuthAdapter = ReturnType<typeof createDefaultAuthAdapter>

const tempDirs: string[] = []

const openTempCli = (
  whichMap: Record<string, string | undefined> = {},
  resolveAuthAdapter?: (agentId: AgentId) => AuthAdapter,
): AgentCli => {
  const dir = mkdtempSync(path.join(os.tmpdir(), "harold-agent-cli-"))
  tempDirs.push(dir)

  return openAgentCli({
    dataDir: dir,
    whichFn: (name) => whichMap[name],
    validateExecutablePathFn: () => true,
    resolveAuthAdapter,
  })
}

const adapterWithProbe = (probe: AuthAdapter["probe"]): AuthAdapter => ({
  ...createDefaultAuthAdapter(),
  probe,
})

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true })
  }
})

describe("openAgentCli", () => {
  test("lists catalog agents without seeding rows", () => {
    const cli = openTempCli()

    try {
      const cursor = cli.list().find((item) => item.id === "cursor")

      expect(cursor).toBeDefined()
      expect(cursor?.enabled).toBe(false)
      expect(cursor?.available).toBe(true)
    } finally {
      cli.close()
    }
  })

  test("enables and disables a catalog agent", () => {
    const cli = openTempCli({ agent: "/usr/local/bin/agent" })

    try {
      const enabled = enableAgent(cli, "cursor")

      if (!enabled.ok) {
        throw new Error(`expected enable to succeed, got ${enabled.error.kind}`)
      }

      expect(enabled.value.enabled).toBe(true)
      expect(enabled.value.present).toBe(true)
      expect(enabled.value.path).toBe("/usr/local/bin/agent")

      const listedEnabled = cli.list().find((item) => item.id === "cursor")
      expect(listedEnabled?.enabled).toBe(true)

      const disabled = disableAgent(cli, "cursor")

      if (!disabled.ok) {
        throw new Error(`expected disable to succeed, got ${disabled.error.kind}`)
      }

      expect(disabled.value.enabled).toBe(false)

      const listedDisabled = cli.list().find((item) => item.id === "cursor")
      expect(listedDisabled?.enabled).toBe(false)
    } finally {
      cli.close()
    }
  })

  test("listWithAuthProbe probes enabled agents and leaves disabled agents unknown", async () => {
    const probed: string[] = []
    const cli = openTempCli({ agent: "/usr/local/bin/agent" }, () =>
      adapterWithProbe(async (ctx) => {
        probed.push(ctx.agentId)
        return { status: "authenticated", error: null, canLogout: false }
      }),
    )

    try {
      const enabled = enableAgent(cli, "cursor")

      if (!enabled.ok) {
        throw new Error(`expected enable to succeed, got ${enabled.error.kind}`)
      }

      const items = await cli.listWithAuthProbe()
      const cursor = items.find((item) => item.id === "cursor")
      const opencode = items.find((item) => item.id === "opencode")

      expect(cursor?.enabled).toBe(true)
      expect(cursor?.authSummary.status).toBe("authenticated")
      expect(opencode?.enabled).toBe(false)
      expect(opencode?.authSummary.status).toBe("unknown")
      expect(probed).toEqual(["cursor"])

      const output = renderAgentList({ items, probe: false })
      expect(output).toContain("authenticated")
      expect(output).toContain("unknown")
    } finally {
      cli.close()
    }
  })

  test("listWithAuthProbe keeps unknown summaries when a probe fails", async () => {
    const probed: string[] = []
    const cli = openTempCli({ agent: "/usr/local/bin/agent", goose: "/usr/local/bin/goose" }, () =>
      adapterWithProbe(async (ctx) => {
        probed.push(ctx.agentId)
        if (ctx.agentId === "cursor") {
          throw new Error("probe failed")
        }
        return { status: "authenticated", error: null, canLogout: false }
      }),
    )

    try {
      if (!enableAgent(cli, "cursor").ok) {
        throw new Error("expected cursor enable to succeed")
      }
      if (!enableAgent(cli, "goose").ok) {
        throw new Error("expected goose enable to succeed")
      }

      const items = await cli.listWithAuthProbe()
      const cursor = items.find((item) => item.id === "cursor")
      const goose = items.find((item) => item.id === "goose")

      expect(new Set(probed)).toEqual(new Set(["cursor", "goose"]))
      expect(cursor?.authSummary.status).toBe("unknown")
      expect(goose?.authSummary.status).toBe("authenticated")
    } finally {
      cli.close()
    }
  })

  test("reports not_found when enabling an unknown agent", () => {
    const cli = openTempCli()

    try {
      const result = enableAgent(cli, "unknown-agent")

      if (result.ok) {
        throw new Error("expected unknown agent to fail")
      }

      expect(result.error.kind).toBe("not_found")
    } finally {
      cli.close()
    }
  })

  test("rolls back an enable when path auto-detect fails", () => {
    const cli = openTempCli({})

    try {
      cli.ensureCatalogRows()
      const prior = cli.findRow("autohand")
      if (prior === undefined) {
        throw new Error("expected a seeded catalog row for autohand")
      }

      const result = enableAgent(cli, "autohand")

      if (result.ok) {
        throw new Error("expected npx-only agent without a binary to fail")
      }

      expect(result.error.kind).toBe("path_auto_detect_failed")
      expect(cli.findRow("autohand")).toEqual(prior)
    } finally {
      cli.close()
    }
  })

  test("probe render reflects presence, runtime, and auth state", () => {
    const cli = openTempCli({ agent: "/usr/local/bin/agent" })

    try {
      const enabled = enableAgent(cli, "cursor")

      if (!enabled.ok) {
        throw new Error(`expected enable to succeed, got ${enabled.error.kind}`)
      }

      const item = cli.list().find((candidate) => candidate.id === "cursor")
      if (item === undefined) {
        throw new Error("expected cursor in agent list")
      }

      const output = renderAgentProbe(item)

      expect(output).toContain("/usr/local/bin/agent")
      expect(output).toContain("unknown")
      expect(output).not.toContain("stopped")
    } finally {
      cli.close()
    }
  })
})
