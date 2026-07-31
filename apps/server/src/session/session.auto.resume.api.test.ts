import { afterEach, describe, expect, test } from "bun:test"
import {
  ConflictProblemSchema,
  PROBLEM_TYPES,
} from "contracts/http/error"
import {
  CreateSessionResponseSchema,
  PromptSessionResponseSchema,
  SessionSchema,
} from "contracts/http/session"
import { WebSocket } from "ws"
import { WhichFn } from "../agent-settings/resolve-agent-path"
import { eq } from "drizzle-orm"
import { sessions } from "../persistence/schema/sessions"
import {
  acceptTestExecutablePath,
  cleanupTestAppResources,
  createTempDataDir,
  createTestApp,
  createTestAppResources,
  enableAgent,
  seedWorkspace,
} from "../test-support/create-test-app"

const resources = createTestAppResources()

afterEach(async () => {
  await cleanupTestAppResources(resources)
})

const waitFor = async (predicate: () => boolean | Promise<boolean>, timeoutMs = 5000) => {
  const startedAt = Date.now()
  while (!(await predicate())) {
    if (Date.now() - startedAt > timeoutMs) {
      throw new Error("timed out waiting for condition")
    }
    await new Promise((resolve) => setTimeout(resolve, 20))
  }
}

const waitForSessionIdle = async (
  app: { inject: (opts: { method: string; url: string }) => Promise<{ body: string }> },
  sessionId: string,
) => {
  await waitFor(async () => {
    const latest = await app.inject({
      method: "GET",
      url: `/v1/sessions/${sessionId}`,
    })
    return SessionSchema.parse(JSON.parse(latest.body)).state === "idle"
  })
}

const unbindAndMarkOffline = async (params: {
  app: {
    inject: (opts: { method: string; url: string }) => Promise<{ body: string; statusCode: number }>
  }
  acpSupervisor: {
    getSessionBindingRegistry: () => {
      getBinding: (acpSessionId: string) => { acpSessionId: string } | undefined
      unbind: (input: { acpSessionId: string }) => void
    }
  }
  database: {
    db: {
      update: (table: typeof sessions) => {
        set: (values: { state: string }) => {
          where: (condition: ReturnType<typeof eq>) => { run: () => void }
        }
      }
      select: () => {
        from: (table: typeof sessions) => {
          where: (condition: ReturnType<typeof eq>) => {
            get: () => { acpSessionId: string; resumable: boolean } | undefined
          }
        }
      }
    }
  }
  sessionId: string
  acpSessionId: string
}) => {
  const live = params.acpSupervisor.getSessionBindingRegistry().getBinding(params.acpSessionId)
  if (live !== undefined) {
    params.acpSupervisor.getSessionBindingRegistry().unbind({
      acpSessionId: live.acpSessionId,
    })
  }

  params.database.db
    .update(sessions)
    .set({ state: "offline" })
    .where(eq(sessions.id, params.sessionId))
    .run()

  const row = params.database.db
    .select()
    .from(sessions)
    .where(eq(sessions.id, params.sessionId))
    .get()
  expect(row?.resumable).toBe(true)
  expect(
    params.acpSupervisor.getSessionBindingRegistry().getBinding(params.acpSessionId),
  ).toBeUndefined()
}

describe("auto-resume on select, stream, and prompt", () => {
  test("select rebinds an offline recoverable session to idle", async () => {
    const dataDir = await createTempDataDir(resources)
    const whichFn: WhichFn = (binaryName) =>
      binaryName === "agent" ? "/usr/local/bin/agent" : undefined
    const { app, acpSupervisor, database } = await createTestApp(
      resources,
      dataDir,
      whichFn,
      acceptTestExecutablePath,
      {
        capabilities: { loadSession: true, sessionClose: false },
        sessionNewSessionId: "auto-select-session",
        sessionLoadSessionId: "auto-select-session-loaded",
      },
    )
    const { workspaceId } = await seedWorkspace(app, dataDir)
    await enableAgent(app, "cursor", whichFn)

    const created = CreateSessionResponseSchema.parse(
      JSON.parse(
        (
          await app.inject({
            method: "POST",
            url: "/v1/sessions",
            payload: { workspaceId, agentId: "cursor", text: "Select resume" },
          })
        ).body,
      ),
    )
    await waitForSessionIdle(app, created.id)
    await unbindAndMarkOffline({
      app,
      acpSupervisor,
      database,
      sessionId: created.id,
      acpSessionId: "auto-select-session",
    })

    const selectResponse = await app.inject({
      method: "POST",
      url: `/v1/sessions/${created.id}/select`,
    })
    const selected = SessionSchema.parse(JSON.parse(selectResponse.body))
    expect(selectResponse.statusCode).toBe(200)
    expect(selected.state).toBe("idle")
    expect(
      acpSupervisor.getSessionBindingRegistry().getBinding("auto-select-session-loaded"),
    ).toBeDefined()
  })

  test("session-scoped event stream open rebinds an offline recoverable session", async () => {
    const dataDir = await createTempDataDir(resources)
    const whichFn: WhichFn = (binaryName) =>
      binaryName === "agent" ? "/usr/local/bin/agent" : undefined
    const { app, acpSupervisor, database, config } = await createTestApp(
      resources,
      dataDir,
      whichFn,
      acceptTestExecutablePath,
      {
        capabilities: { loadSession: true, sessionClose: false },
        sessionNewSessionId: "auto-stream-session",
        sessionLoadSessionId: "auto-stream-session-loaded",
      },
    )
    const { workspaceId } = await seedWorkspace(app, dataDir)
    await enableAgent(app, "cursor", whichFn)

    const created = CreateSessionResponseSchema.parse(
      JSON.parse(
        (
          await app.inject({
            method: "POST",
            url: "/v1/sessions",
            payload: { workspaceId, agentId: "cursor", text: "Stream resume" },
          })
        ).body,
      ),
    )
    await waitForSessionIdle(app, created.id)
    await unbindAndMarkOffline({
      app,
      acpSupervisor,
      database,
      sessionId: created.id,
      acpSessionId: "auto-stream-session",
    })

    await app.listen({ host: config.host, port: 0 })
    const address = app.server.address()
    if (address === null || typeof address === "string") {
      throw new Error("expected bound server address")
    }
    const url = `ws://${config.host}:${address.port}/v1/events?sessionId=${created.id}`

    await new Promise<void>((resolve, reject) => {
      const ws = new WebSocket(url)
      const timer = setTimeout(() => {
        ws.close()
        reject(new Error("timed out waiting for stream open"))
      }, 5000)
      ws.addEventListener("open", () => {
        clearTimeout(timer)
        ws.close()
        resolve()
      })
      ws.addEventListener("error", (error) => {
        clearTimeout(timer)
        reject(error)
      })
    })

    const after = SessionSchema.parse(
      JSON.parse((await app.inject({ method: "GET", url: `/v1/sessions/${created.id}` })).body),
    )
    expect(after.state).toBe("idle")
    expect(
      acpSupervisor.getSessionBindingRegistry().getBinding("auto-stream-session-loaded"),
    ).toBeDefined()
  })

  test("prompt rebinds an unbound recoverable session then accepts the prompt", async () => {
    const dataDir = await createTempDataDir(resources)
    const whichFn: WhichFn = (binaryName) =>
      binaryName === "agent" ? "/usr/local/bin/agent" : undefined
    const { app, acpSupervisor, database } = await createTestApp(
      resources,
      dataDir,
      whichFn,
      acceptTestExecutablePath,
      {
        capabilities: { loadSession: true, sessionClose: false },
        sessionNewSessionId: "auto-prompt-session",
        sessionLoadSessionId: "auto-prompt-session-loaded",
      },
    )
    const { workspaceId } = await seedWorkspace(app, dataDir)
    await enableAgent(app, "cursor", whichFn)

    const created = CreateSessionResponseSchema.parse(
      JSON.parse(
        (
          await app.inject({
            method: "POST",
            url: "/v1/sessions",
            payload: { workspaceId, agentId: "cursor", text: "Prompt resume" },
          })
        ).body,
      ),
    )
    await waitForSessionIdle(app, created.id)
    await unbindAndMarkOffline({
      app,
      acpSupervisor,
      database,
      sessionId: created.id,
      acpSessionId: "auto-prompt-session",
    })

    const promptResponse = await app.inject({
      method: "POST",
      url: `/v1/sessions/${created.id}/prompt`,
      payload: { text: "after rebind" },
    })
    expect(promptResponse.statusCode).toBe(202)
    PromptSessionResponseSchema.parse(JSON.parse(promptResponse.body))
    expect(
      acpSupervisor.getSessionBindingRegistry().getBinding("auto-prompt-session-loaded"),
    ).toBeDefined()
  })

  test("failed load on select marks error, clears resumable, and does not retry", async () => {
    const dataDir = await createTempDataDir(resources)
    const whichFn: WhichFn = (binaryName) =>
      binaryName === "agent" ? "/usr/local/bin/agent" : undefined
    const { app, acpSupervisor, database } = await createTestApp(
      resources,
      dataDir,
      whichFn,
      acceptTestExecutablePath,
      {
        capabilities: { loadSession: true, sessionClose: false },
        sessionNewSessionId: "auto-fail-session",
        sessionLoadSessionId: "auto-fail-session-loaded",
        sessionLoadFails: true,
      },
    )
    const { workspaceId } = await seedWorkspace(app, dataDir)
    await enableAgent(app, "cursor", whichFn)

    const created = CreateSessionResponseSchema.parse(
      JSON.parse(
        (
          await app.inject({
            method: "POST",
            url: "/v1/sessions",
            payload: { workspaceId, agentId: "cursor", text: "Fail resume" },
          })
        ).body,
      ),
    )
    await waitForSessionIdle(app, created.id)
    await unbindAndMarkOffline({
      app,
      acpSupervisor,
      database,
      sessionId: created.id,
      acpSessionId: "auto-fail-session",
    })

    const selectResponse = await app.inject({
      method: "POST",
      url: `/v1/sessions/${created.id}/select`,
    })
    const selected = SessionSchema.parse(JSON.parse(selectResponse.body))
    expect(selectResponse.statusCode).toBe(200)
    expect(selected.state).toBe("error")
    expect(selected.name).toBe("Fail resume")

    const row = database.db
      .select()
      .from(sessions)
      .where(eq(sessions.id, created.id))
      .get()
    expect(row?.resumable).toBe(false)

    const selectAgain = await app.inject({
      method: "POST",
      url: `/v1/sessions/${created.id}/select`,
    })
    expect(SessionSchema.parse(JSON.parse(selectAgain.body)).state).toBe("error")
    expect(
      acpSupervisor.getSessionBindingRegistry().getBinding("auto-fail-session-loaded"),
    ).toBeUndefined()

    const promptResponse = await app.inject({
      method: "POST",
      url: `/v1/sessions/${created.id}/prompt`,
      payload: { text: "should fail" },
    })
    const problem = ConflictProblemSchema.parse(JSON.parse(promptResponse.body))
    expect(promptResponse.statusCode).toBe(409)
    expect(problem.type).toBe(PROBLEM_TYPES.conflict)
  })
})
