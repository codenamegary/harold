import { describe, expect, test } from "bun:test"
import { execSync } from "node:child_process"
import { mkdir, mkdtemp, rm } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { SessionSchema } from "contracts/http/session"
import { createServer } from "../bootstrap/server"
import { parseConfig } from "../config/config"
import { openDatabase } from "../persistence/database"
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
    const { app, acpSupervisor } = await createServer({ config, runtime, database, whichFn })
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
      await acpSupervisor.stop()
      await app.close()
      database.close()
      await rm(dataDir, { recursive: true, force: true })
    }
  })

  // Characterizes today's Cursor build: it advertises loadSession but session/load
  // returns Invalid params. A 200 here means Cursor shipped the fix. Swap the
  // assertions back to a successful resume when that happens.
  test.skipIf(!shouldRunSmoke)(
    "restarts server, keeps session metadata, and reports the Cursor session/load gap",
    async () => {
      const dataDir = await mkdtemp(path.join(os.tmpdir(), "agent-server-cursor-smoke-resume-"))
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

        await acpSupervisor.stop()
        await app.close()
        database.close()

        const restartedDatabase = openDatabase({ dataDir: config.dataDir })
        const restartedRuntime = createRuntime("0.1.0")
        const restarted = await createServer({
          config,
          runtime: restartedRuntime,
          database: restartedDatabase,
          whichFn,
        })
        await restarted.app.listen({ host: config.host, port: config.port })

        try {
          const reenableResponse = await restarted.app.inject({
            method: "PATCH",
            url: "/v1/settings/agents/cursor",
            payload: { enabled: true, path: detectedPath },
          })
          expect(reenableResponse.statusCode).toBe(200)

          const survivedResponse = await restarted.app.inject({
            method: "GET",
            url: `/v1/sessions/${session.id}`,
          })
          expect(survivedResponse.statusCode).toBe(200)
          const survived = SessionSchema.parse(JSON.parse(survivedResponse.body))
          expect(survived.name).toBe("Smoke session")
          expect(survived.archivedAt).toBeNull()

          const resumeResponse = await restarted.app.inject({
            method: "POST",
            url: `/v1/sessions/${session.id}/resume`,
          })
          expect(resumeResponse.statusCode).toBe(409)
          const problem = JSON.parse(resumeResponse.body) as {
            title: string
            detail: string
            type: string
          }
          expect(problem.title).toBe("Session is not resumable")
          expect(problem.type).toContain("conflict")
          // Cursor may put a useful session-not-found string in error.data.message.
          // Prefer that. Bare Invalid params maps to the actionable fallback.
          expect(problem.detail).not.toBe("Invalid params")
          expect(problem.detail).not.toContain("Invalid params")
          expect(
            problem.detail === "Cursor could not load this session. Start a new session."
              || /not found/i.test(problem.detail),
          ).toBe(true)

          const intactResponse = await restarted.app.inject({
            method: "GET",
            url: `/v1/sessions/${session.id}`,
          })
          expect(intactResponse.statusCode).toBe(200)
          expect(SessionSchema.parse(JSON.parse(intactResponse.body)).name).toBe("Smoke session")

          const archiveResponse = await restarted.app.inject({
            method: "POST",
            url: `/v1/sessions/${session.id}/archive`,
          })
          expect(archiveResponse.statusCode).toBe(200)
          const archived = SessionSchema.parse(JSON.parse(archiveResponse.body))
          expect(archived.state).toBe("archived")
        } finally {
          await restarted.acpSupervisor.stop()
          await restarted.app.close()
          restartedDatabase.close()
        }
      } finally {
        await rm(dataDir, { recursive: true, force: true })
      }
    },
  )
})
