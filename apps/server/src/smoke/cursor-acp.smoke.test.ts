import { describe, expect, test } from "bun:test"
import { execSync } from "node:child_process"
import { mkdir, mkdtemp, rm } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { SessionSchema } from "contracts/http/session"
import { createServer } from "../bootstrap/create-server"
import { parseConfig } from "../config/config"
import { openDatabase } from "../persistence/open-database"
import { createRuntime } from "../runtime/runtime"
import { WhichFn } from "../agent-settings/resolve-agent-path"

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
  Boolean(process.env.CURSOR_API_KEY ?? process.env.CURSOR_AUTH_TOKEN) ||
  hasCliLogin()

const hasAgentBinary = (): boolean => {
  try {
    execSync("which agent", { stdio: "ignore" })
    return true
  } catch {
    return false
  }
}

const shouldRunSmoke =
  process.env.AGENT_SERVER_RUN_CURSOR_SMOKE === "1" &&
  hasCursorAuth() &&
  hasAgentBinary()

describe("cursor ACP smoke", () => {
  test.skipIf(!shouldRunSmoke)("enables cursor, creates workspace and session, then archives", async () => {
    const dataDir = await mkdtemp(path.join(os.tmpdir(), "agent-server-cursor-smoke-"))
    const workspaceDir = path.join(dataDir, "smoke-project")
    await mkdir(workspaceDir)

    const detectedPath = execSync("which agent", { encoding: "utf8" }).trim()
    const whichFn: WhichFn = (binaryName) =>
      binaryName === "agent" ? detectedPath : undefined

    const config = parseConfig({
      AGENT_SERVER_HOST: "127.0.0.1",
      AGENT_SERVER_PORT: "0",
      AGENT_SERVER_DATA_DIR: dataDir,
    })
    const database = openDatabase({ dataDir: config.dataDir })
    const runtime = createRuntime("0.1.0")
    const { app } = await createServer({ config, runtime, database, whichFn })
    await app.listen({ host: config.host, port: config.port })

    try {
      const enableResponse = await app.inject({
        method: "PATCH",
        url: "/v1/settings/agents/cursor",
        payload: { enabled: true, path: detectedPath },
      })
      expect(enableResponse.statusCode).toBe(200)

      const workspaceResponse = await app.inject({
        method: "POST",
        url: "/v1/workspaces",
        payload: { name: "Smoke workspace", path: workspaceDir },
      })
      expect(workspaceResponse.statusCode).toBe(201)
      const workspace = JSON.parse(workspaceResponse.body) as { id: string }

      const sessionResponse = await app.inject({
        method: "POST",
        url: "/v1/sessions",
        payload: {
          workspaceId: workspace.id,
          agentId: "cursor",
          name: "Smoke session",
        },
      })
      expect(sessionResponse.statusCode).toBe(201)
      const session = SessionSchema.parse(JSON.parse(sessionResponse.body))

      const archiveResponse = await app.inject({
        method: "POST",
        url: `/v1/sessions/${session.id}/archive`,
      })
      expect(archiveResponse.statusCode).toBe(200)
      const archived = SessionSchema.parse(JSON.parse(archiveResponse.body))
      expect(archived.state).toBe("archived")
    } finally {
      await app.close()
      database.close()
      await rm(dataDir, { recursive: true, force: true })
    }
  })
})
