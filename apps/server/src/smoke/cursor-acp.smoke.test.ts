import { describe, expect, test } from "bun:test"
import { execSync } from "node:child_process"
import { mkdir, mkdtemp, rm } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { eq } from "drizzle-orm"
import { CreateSessionResponseSchema, SessionSchema } from "contracts/http/session"
import { WhichFn } from "../agent-settings/resolve-agent-path"
import { createServer } from "../bootstrap/server"
import { parseConfig } from "../config/config"
import { openDatabase } from "../persistence/database"
import { sessions } from "../persistence/schema/sessions"
import { createRuntime } from "../runtime/runtime"

const waitFor = async (
  predicate: () => boolean | Promise<boolean>,
  timeoutMs = 15_000,
  label = "condition",
) => {
  const startedAt = Date.now()
  while (!(await predicate())) {
    if (Date.now() - startedAt > timeoutMs) {
      throw new Error(`timed out waiting for ${label}`)
    }
    await new Promise((resolve) => setTimeout(resolve, 50))
  }
}

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
          text: "Smoke session",
        },
      })
      expect(sessionResponse.statusCode).toBe(201)
      const session = CreateSessionResponseSchema.parse(JSON.parse(sessionResponse.body))

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
            text: "Smoke session",
          },
        })
        expect(sessionResponse.statusCode).toBe(201)
        const session = CreateSessionResponseSchema.parse(JSON.parse(sessionResponse.body))

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

  // Stale running after hard kill: boot heals to offline and auto-runs session/load.
  // Today Cursor load still fails, so expect terminal error (not idle). When Cursor
  // session/load works, flip the post-heal expectation to idle.
  test.skipIf(!shouldRunSmoke)(
    "heals stale running on boot and attempts startup recovery",
    async () => {
      const dataDir = await mkdtemp(
        path.join(os.tmpdir(), "agent-server-cursor-smoke-stale-running-"),
      )
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
      const { app, acpSupervisor, disposeOfflineOnBindingClear } = await createServer({
        config,
        runtime,
        database,
        whichFn,
      })
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
            text: "Stale running smoke",
          },
        })
        expect(sessionResponse.statusCode).toBe(201)
        const session = CreateSessionResponseSchema.parse(JSON.parse(sessionResponse.body))

        // Do not wait for the live turn to finish. Hard-kill style: drop the process
        // without orderly offline marking, then leave (or force) stale running on disk.
        disposeOfflineOnBindingClear()
        await acpSupervisor.stop()
        await app.close()
        database.close()

        const staleDatabase = openDatabase({ dataDir: config.dataDir })
        const beforeForce = staleDatabase.db
          .select()
          .from(sessions)
          .where(eq(sessions.id, session.id))
          .get()
        expect(beforeForce?.resumable).toBe(true)
        if (beforeForce?.state !== "running") {
          staleDatabase.db
            .update(sessions)
            .set({ state: "running" })
            .where(eq(sessions.id, session.id))
            .run()
        }
        const staleRow = staleDatabase.db
          .select()
          .from(sessions)
          .where(eq(sessions.id, session.id))
          .get()
        expect(staleRow?.state).toBe("running")
        expect(staleRow?.resumable).toBe(true)
        staleDatabase.close()

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

          await restarted.acpSupervisor.start("cursor")

          await waitFor(
            async () => {
              const latest = await restarted.app.inject({
                method: "GET",
                url: `/v1/sessions/${session.id}`,
              })
              const state = SessionSchema.parse(JSON.parse(latest.body)).state
              return state === "error" || state === "idle"
            },
            30_000,
            "startup recovery to settle (error or idle)",
          )

          const recovered = SessionSchema.parse(
            JSON.parse(
              (
                await restarted.app.inject({
                  method: "GET",
                  url: `/v1/sessions/${session.id}`,
                })
              ).body,
            ),
          )
          expect(recovered.name).toBe("Stale running smoke")
          // Cursor session/load still fails today → error. Idle means load started working.
          expect(["error", "idle"]).toContain(recovered.state)

          const row = restartedDatabase.db
            .select()
            .from(sessions)
            .where(eq(sessions.id, session.id))
            .get()
          expect(row?.state).toBe(recovered.state)
          if (recovered.state === "error") {
            expect(row?.resumable).toBe(false)
          }
          if (recovered.state === "idle") {
            expect(row?.resumable).toBe(true)
          }
        } finally {
          await restarted.acpSupervisor.stop()
          await restarted.app.close()
          restartedDatabase.close()
        }
      } finally {
        await rm(dataDir, { recursive: true, force: true })
      }
    },
    { timeout: 60_000 },
  )
})
