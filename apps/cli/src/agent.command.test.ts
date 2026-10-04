import { afterEach, describe, expect, test } from "bun:test"
import { mkdtempSync, rmSync } from "node:fs"
import os from "node:os"
import path from "node:path"
import { AgentCli, disableAgent, enableAgent, openAgentCli } from "./agent.command"
import { renderAgentProbe } from "./agent.render"

const tempDirs: string[] = []

const openTempCli = (whichMap: Record<string, string | undefined> = {}): AgentCli => {
  const dir = mkdtempSync(path.join(os.tmpdir(), "harold-agent-cli-"))
  tempDirs.push(dir)

  return openAgentCli({
    dataDir: dir,
    whichFn: (name) => whichMap[name],
    validateExecutablePathFn: () => true,
  })
}

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
      const result = enableAgent(cli, "autohand")

      if (result.ok) {
        throw new Error("expected npx-only agent without a binary to fail")
      }

      expect(result.error.kind).toBe("path_auto_detect_failed")

      const autohand = cli.list().find((item) => item.id === "autohand")
      expect(autohand?.enabled).toBe(false)
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
      expect(output).toContain("stopped")
      expect(output).toContain("unknown")
    } finally {
      cli.close()
    }
  })
})
