import { describe, expect, test } from "bun:test"
import { execSync } from "node:child_process"
import { mkdir, mkdtemp, rm } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { CreateSessionResponseSchema, SessionCollectionSchema } from "contracts/http/session"
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

const hasAgentBinary = (): boolean => {
  try {
    execSync("which agent", { stdio: "ignore" })
    return true
  } catch {
    return false
  }
}

const shouldRunSmoke =
  process.env.AGENT_SERVER_RUN_CURSOR_SMOKE === "1" && hasCursorAuth() && hasAgentBinary()

const allowWorkspaceRoots = async (
  app: Awaited<ReturnType<typeof createServer>>["app"],
  roots: string[],
) => {
  const response = await app.inject({
    method: "PATCH",
    url: "/v1/settings/runtime",
    payload: { allowedRoots: roots },
  })
  expect(response.statusCode).toBe(200)
}

describe("cursor ACP smoke", () => {
  test.skipIf(!shouldRunSmoke)(
    "creates workspace and gateway session, then lists and deletes it",
    async () => {
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
      const { app, acpSupervisor } = await createServer({ config, runtime, database, whichFn })
      await app.listen({ host: config.host, port: config.port })

      try {
        const enableResponse = await app.inject({
          method: "PATCH",
          url: "/v1/settings/agents/cursor",
          payload: { enabled: true, path: detectedPath },
        })
        expect(enableResponse.statusCode).toBe(200)

        await allowWorkspaceRoots(app, [dataDir])

        const workspaceResponse = await app.inject({
          method: "POST",
          url: "/v1/workspaces",
          payload: { name: "Smoke workspace", path: workspaceDir },
        })
        expect(workspaceResponse.statusCode).toBe(201)

        const sessionResponse = await app.inject({
          method: "POST",
          url: "/v1/sessions",
          payload: { agentId: "cursor", cwd: workspaceDir },
        })
        expect(sessionResponse.statusCode).toBe(201)
        const session = CreateSessionResponseSchema.parse(JSON.parse(sessionResponse.body))

        const listResponse = await app.inject({
          method: "GET",
          url: `/v1/sessions?cwd=${encodeURIComponent(workspaceDir)}`,
        })
        expect(listResponse.statusCode).toBe(200)
        const listed = SessionCollectionSchema.parse(JSON.parse(listResponse.body))
        expect(listed.items.some((item) => item.sessionId === session.sessionId)).toBe(true)

        const deleteResponse = await app.inject({
          method: "DELETE",
          url: `/v1/sessions/${encodeURIComponent(session.sessionId)}?agentId=cursor`,
        })
        expect([204, 409]).toContain(deleteResponse.statusCode)
      } finally {
        await acpSupervisor.stop()
        await app.close()
        database.close()
        await rm(dataDir, { recursive: true, force: true })
      }
    },
  )
})
