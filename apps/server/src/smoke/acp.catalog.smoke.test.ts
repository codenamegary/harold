import { describe, expect, test } from "bun:test"
import { execSync } from "node:child_process"
import { mkdtemp, rm } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { SessionCollectionSchema } from "contracts/http/session"
import { WhichFn } from "../agent-settings/resolve-agent-path"
import { createServer } from "../bootstrap/server"
import { parseConfig } from "../config/config"
import { openDatabase } from "../persistence/database"
import { createRuntime } from "../runtime/runtime"

const hasCliLogin = (): boolean => {
  try {
    const output = execSync("agent status", {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    })
    return output.includes("Logged in")
  } catch {
    return false
  }
}

const hasCursorAuth = (): boolean =>
  Boolean(process.env.CURSOR_API_KEY ?? process.env.CURSOR_AUTH_TOKEN) || hasCliLogin()

const resolveAgentPath = (): string | undefined => {
  try {
    return execSync("which agent", { encoding: "utf8" }).trim()
  } catch {
    return undefined
  }
}

const resolveOpenCodePath = (): string | undefined => {
  try {
    return execSync("which opencode", { encoding: "utf8" }).trim()
  } catch {
    const homePath = path.join(os.homedir(), ".opencode", "bin", "opencode")
    try {
      execSync(`test -x ${homePath}`, { stdio: "ignore" })
      return homePath
    } catch {
      return undefined
    }
  }
}

const shouldRunSmoke =
  process.env.AGENT_SERVER_RUN_CURSOR_SMOKE === "1" &&
  hasCursorAuth() &&
  resolveAgentPath() !== undefined

const shouldRunOpenCodeSmoke =
  process.env.AGENT_SERVER_RUN_CURSOR_SMOKE === "1" && resolveOpenCodePath() !== undefined

describe("ACP catalog session/list smoke", () => {
  test.skipIf(!shouldRunSmoke)("Cursor enable + GET /v1/sessions lists ACP rows", async () => {
    const dataDir = await mkdtemp(path.join(os.tmpdir(), "agent-server-catalog-cursor-smoke-"))
    const detectedPath = resolveAgentPath()
    if (detectedPath === undefined) {
      throw new Error("agent binary missing")
    }

    const whichFn: WhichFn = (binaryName) =>
      binaryName === "agent" ? detectedPath : undefined

    const config = parseConfig({
      AGENT_SERVER_HOST: "127.0.0.1",
      AGENT_SERVER_PORT: "0",
      AGENT_SERVER_DATA_DIR: dataDir,
    })
    const database = openDatabase({ dataDir: config.dataDir })
    const runtime = createRuntime("0.1.0")
    const { app, acpSupervisor } = await createServer({ config, runtime, database, whichFn })

    try {
      const enableResponse = await app.inject({
        method: "PATCH",
        url: "/v1/settings/agents/cursor",
        payload: { enabled: true, path: detectedPath },
      })
      expect(enableResponse.statusCode).toBe(200)
      expect(acpSupervisor.getRunningAgentIds()).toContain("cursor")

      const listResponse = await app.inject({ method: "GET", url: "/v1/sessions" })
      expect(listResponse.statusCode).toBe(200)
      const collection = SessionCollectionSchema.parse(JSON.parse(listResponse.body))
      expect(Array.isArray(collection.items)).toBe(true)
      for (const item of collection.items) {
        expect(item.agentId).toBe("cursor")
        expect(item.sessionId.length).toBeGreaterThan(0)
      }
    } finally {
      await acpSupervisor.stop()
      await app.close()
      database.close()
      await rm(dataDir, { recursive: true, force: true })
    }
  })

  test.skipIf(!shouldRunOpenCodeSmoke)(
    "OpenCode enable + GET /v1/sessions returns a catalog (empty list is fine)",
    async () => {
      const dataDir = await mkdtemp(path.join(os.tmpdir(), "agent-server-catalog-opencode-smoke-"))
      const detectedPath = resolveOpenCodePath()
      if (detectedPath === undefined) {
        throw new Error("opencode binary missing")
      }

      const whichFn: WhichFn = (binaryName) =>
        binaryName === "opencode" ? detectedPath : undefined

      const config = parseConfig({
        AGENT_SERVER_HOST: "127.0.0.1",
        AGENT_SERVER_PORT: "0",
        AGENT_SERVER_DATA_DIR: dataDir,
      })
      const database = openDatabase({ dataDir: config.dataDir })
      const runtime = createRuntime("0.1.0")
      const { app, acpSupervisor } = await createServer({ config, runtime, database, whichFn })

      try {
        const enableResponse = await app.inject({
          method: "PATCH",
          url: "/v1/settings/agents/opencode",
          payload: { enabled: true, path: detectedPath },
        })
        expect(enableResponse.statusCode).toBe(200)
        expect(acpSupervisor.getRunningAgentIds()).toContain("opencode")

        const listResponse = await app.inject({ method: "GET", url: "/v1/sessions" })
        expect(listResponse.statusCode).toBe(200)
        const collection = SessionCollectionSchema.parse(JSON.parse(listResponse.body))
        expect(Array.isArray(collection.items)).toBe(true)
        for (const item of collection.items) {
          expect(item.agentId).toBe("opencode")
        }
      } finally {
        await acpSupervisor.stop()
        await app.close()
        database.close()
        await rm(dataDir, { recursive: true, force: true })
      }
    },
  )
})
