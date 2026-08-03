import { describe, expect, test } from "bun:test"
import { execSync } from "node:child_process"
import { mkdir, mkdtemp, rm } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { eq } from "drizzle-orm"
import { EventFrameSchema } from "contracts/events/stream"
import { Event } from "contracts/events/event"
import {
  CancelSessionResponseSchema,
  CreateSessionResponseSchema,
  PromptSessionResponseSchema,
  SessionSchema,
} from "contracts/http/session"
import { WebSocket } from "ws"
import { WhichFn } from "../agent-settings/resolve-agent-path"
import { createServer } from "../bootstrap/server"
import { Config, parseConfig } from "../config/config"
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

type InjectApp = {
  inject: (opts: {
    method: string
    url: string
    payload?: Record<string, unknown>
  }) => Promise<{ body: string; statusCode: number }>
  listen: (opts: { host: string; port: number }) => Promise<string>
  server: { address: () => unknown }
  close: () => Promise<void>
}

const getBoundUrls = (app: InjectApp, config: Config) => {
  const address = app.server.address()
  if (address === null || typeof address === "string") {
    throw new Error("expected bound server address")
  }

  return {
    httpBase: `http://${config.host}:${address.port}`,
    wsUrl: `ws://${config.host}:${address.port}/v1/events`,
  }
}

const collectEventsUntil = (params: {
  url: string
  until: (events: Event[]) => boolean
  timeoutMs?: number
}): { eventsPromise: Promise<Event[]>; whenOpen: Promise<void> } => {
  const openState: { resolve: (() => void) | undefined } = { resolve: undefined }

  const whenOpen = new Promise<void>((resolve) => {
    openState.resolve = resolve
  })

  const eventsPromise = new Promise<Event[]>((resolve, reject) => {
    const ws = new WebSocket(params.url)
    const events: Event[] = []
    const timeoutMs = params.timeoutMs ?? 60_000
    const timeout = setTimeout(() => {
      ws.close()
      reject(new Error("timed out collecting websocket events"))
    }, timeoutMs)

    ws.addEventListener("open", () => {
      openState.resolve?.()
    })

    ws.addEventListener("message", (event) => {
      const frame = EventFrameSchema.parse(JSON.parse(String(event.data)))
      events.push(...frame)
      if (params.until(events)) {
        clearTimeout(timeout)
        ws.close()
        resolve(events)
      }
    })

    ws.addEventListener("error", (error) => {
      clearTimeout(timeout)
      reject(error)
    })
  })

  return { eventsPromise, whenOpen }
}

const collectReplayEvents = (params: {
  url: string
  idleMs?: number
  timeoutMs?: number
}): Promise<Event[]> =>
  new Promise((resolve, reject) => {
    const ws = new WebSocket(params.url)
    const events: Event[] = []
    const idleMs = params.idleMs ?? 400
    const timeoutMs = params.timeoutMs ?? 30_000
    const idleTimer: { handle: ReturnType<typeof setTimeout> | undefined } = {
      handle: undefined,
    }

    const finish = (result: Event[]) => {
      if (idleTimer.handle !== undefined) {
        clearTimeout(idleTimer.handle)
      }
      clearTimeout(hardTimeout)
      ws.close()
      resolve(result)
    }

    const resetIdleTimer = () => {
      if (idleTimer.handle !== undefined) {
        clearTimeout(idleTimer.handle)
      }
      idleTimer.handle = setTimeout(() => {
        finish(events)
      }, idleMs)
    }

    const hardTimeout = setTimeout(() => {
      if (idleTimer.handle !== undefined) {
        clearTimeout(idleTimer.handle)
      }
      ws.close()
      reject(new Error("timed out collecting replay events"))
    }, timeoutMs)

    ws.addEventListener("open", () => {
      resetIdleTimer()
    })

    ws.addEventListener("message", (event) => {
      const frame = EventFrameSchema.parse(JSON.parse(String(event.data)))
      events.push(...frame)
      resetIdleTimer()
    })

    ws.addEventListener("error", (error) => {
      if (idleTimer.handle !== undefined) {
        clearTimeout(idleTimer.handle)
      }
      clearTimeout(hardTimeout)
      reject(error)
    })
  })

const waitForSessionState = async (
  app: InjectApp,
  sessionId: string,
  state: string,
  timeoutMs = 60_000,
) => {
  await waitFor(
    async () => {
      const latest = await app.inject({
        method: "GET",
        url: `/v1/sessions/${sessionId}`,
      })
      return SessionSchema.parse(JSON.parse(latest.body)).state === state
    },
    timeoutMs,
    `session ${sessionId} to reach ${state}`,
  )
}

const createIdleSession = async (
  app: InjectApp,
  params: { workspaceId: string; text: string },
) => {
  const created = await app.inject({
    method: "POST",
    url: "/v1/sessions",
    payload: {
      workspaceId: params.workspaceId,
      agentId: "cursor",
      text: params.text,
    },
  })
  expect(created.statusCode).toBe(201)
  const session = CreateSessionResponseSchema.parse(JSON.parse(created.body))

  // Create starts a seed turn. Wait briefly for natural idle. If still running, cancel.
  const settledEarly = await waitFor(
    async () => (await sessionState(app, session.id)) === "idle",
    15_000,
    `session ${session.id} early idle`,
  ).then(
    () => true,
    () => false,
  )

  if (!settledEarly) {
    const cancelResponse = await app.inject({
      method: "POST",
      url: `/v1/sessions/${session.id}/cancel`,
    })
    expect([202, 409]).toContain(cancelResponse.statusCode)
  }

  await waitForSessionState(app, session.id, "idle", 60_000)
  return session
}

const sessionState = async (app: InjectApp, sessionId: string) => {
  const response = await app.inject({
    method: "GET",
    url: `/v1/sessions/${sessionId}`,
  })
  return SessionSchema.parse(JSON.parse(response.body)).state
}

const assertHonestResumeFallback = (params: {
  statusCode: number
  body: string
}) => {
  expect(params.statusCode).toBe(409)
  const problem = JSON.parse(params.body) as {
    title: string
    detail: string
    type: string
  }
  expect(problem.title).toBe("Session is not resumable")
  expect(problem.type).toContain("conflict")
  expect(problem.detail).not.toBe("Invalid params")
  expect(problem.detail).not.toContain("Invalid params")
  expect(
    problem.detail === "Cursor could not load this session. Start a new session."
      || /not found/i.test(problem.detail),
  ).toBe(true)
}

const hasTurnCompleted = (events: Event[], turnId: string) =>
  events.some(
    (event) => event.type === "turn.completed" && event.payload.turnId === turnId,
  )

const hasTurnCancelled = (events: Event[], turnId: string) =>
  events.some(
    (event) => event.type === "turn.cancelled" && event.payload.turnId === turnId,
  )

const hasOutputOrMessageChunk = (events: Event[], turnId: string) =>
  events.some(
    (event) =>
      (event.type === "session.output.delta" || event.type === "session.output.complete")
      && event.payload.turnId === turnId,
  )

const hasTurnStarted = (events: Event[], turnId: string) =>
  events.some(
    (event) => event.type === "turn.started" && event.payload.turnId === turnId,
  )

const hasTerminalTurn = (events: Event[], turnId: string) =>
  hasTurnCompleted(events, turnId) || hasTurnCancelled(events, turnId)

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

      await allowWorkspaceRoots(app, [dataDir])

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

        await allowWorkspaceRoots(app, [dataDir])

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
          assertHonestResumeFallback({
            statusCode: resumeResponse.statusCode,
            body: resumeResponse.body,
          })

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

        await allowWorkspaceRoots(app, [dataDir])

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

  test.skipIf(!shouldRunSmoke)(
    "MS1 operator journey: two sessions, stream, switch, cancel, restart, replay, honest resume",
    async () => {
      const dataDir = await mkdtemp(path.join(os.tmpdir(), "agent-server-cursor-smoke-ms1-"))
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

      const knownTurnIds: string[] = []

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
          payload: { name: "MS1 journey workspace", path: workspaceDir },
        })
        expect(workspaceResponse.statusCode).toBe(201)
        const workspace = JSON.parse(workspaceResponse.body) as { id: string }

        const sessionA = await createIdleSession(app, {
          workspaceId: workspace.id,
          text: "ok A",
        })
        const sessionB = await createIdleSession(app, {
          workspaceId: workspace.id,
          text: "ok B",
        })
        expect(sessionA.id).not.toBe(sessionB.id)

        const { httpBase, wsUrl } = getBoundUrls(app, config)

        // Short prompt: assert stream event types only (no exact model text).
        const shortStream = collectEventsUntil({
          url: `${wsUrl}?sessionId=${sessionA.id}`,
          timeoutMs: 60_000,
          until: (events) =>
            events.some((event) => event.type === "turn.started")
            && events.some(
              (event) =>
                event.type === "session.output.delta"
                || event.type === "session.output.complete",
            )
            && events.some(
              (event) =>
                event.type === "turn.completed" || event.type === "turn.cancelled",
            ),
        })
        await shortStream.whenOpen

        const shortPromptResponse = await fetch(`${httpBase}/v1/sessions/${sessionA.id}/prompt`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ text: "Reply with ok." }),
        })
        expect(shortPromptResponse.status).toBe(202)
        const shortPrompt = PromptSessionResponseSchema.parse(await shortPromptResponse.json())
        knownTurnIds.push(shortPrompt.turnId)

        const shortEvents = await shortStream.eventsPromise
        expect(hasTurnStarted(shortEvents, shortPrompt.turnId)).toBe(true)
        expect(hasOutputOrMessageChunk(shortEvents, shortPrompt.turnId)).toBe(true)
        expect(hasTerminalTurn(shortEvents, shortPrompt.turnId)).toBe(true)
        expect(shortEvents.every((event) => event.sessionId === sessionA.id)).toBe(true)

        await waitForSessionState(app, sessionA.id, "idle")

        // Concurrent switch: long turn on A, select B and prompt B while A is running.
        const longPromptText =
          "Count from 1 to 40. Put each number on its own line. Do not skip any numbers."

        const eventsACollector = collectEventsUntil({
          url: `${wsUrl}?sessionId=${sessionA.id}`,
          timeoutMs: 90_000,
          until: (events) =>
            events.some(
              (event) =>
                event.type === "turn.completed" || event.type === "turn.cancelled",
            ),
        })
        const eventsBCollector = collectEventsUntil({
          url: `${wsUrl}?sessionId=${sessionB.id}`,
          timeoutMs: 90_000,
          until: (events) =>
            events.some(
              (event) =>
                event.type === "turn.completed" || event.type === "turn.cancelled",
            ),
        })
        await Promise.all([eventsACollector.whenOpen, eventsBCollector.whenOpen])

        const promptAResponse = await fetch(`${httpBase}/v1/sessions/${sessionA.id}/prompt`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ text: longPromptText }),
        })
        expect(promptAResponse.status).toBe(202)
        const promptA = PromptSessionResponseSchema.parse(await promptAResponse.json())
        knownTurnIds.push(promptA.turnId)

        await waitFor(
          async () => (await sessionState(app, sessionA.id)) === "running",
          30_000,
          "session A running after long prompt",
        )

        const selectB = await fetch(`${httpBase}/v1/sessions/${sessionB.id}/select`, {
          method: "POST",
        })
        expect(selectB.status).toBe(200)

        expect(await sessionState(app, sessionA.id)).toBe("running")

        const promptBResponse = await fetch(`${httpBase}/v1/sessions/${sessionB.id}/prompt`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ text: "Reply with ok." }),
        })
        expect(promptBResponse.status).toBe(202)
        const promptB = PromptSessionResponseSchema.parse(await promptBResponse.json())
        knownTurnIds.push(promptB.turnId)

        // A must still be running (or may have just completed). Not cancelled by the switch.
        const overlappingA = await sessionState(app, sessionA.id)
        expect(["running", "idle"]).toContain(overlappingA)

        const [collectedA, collectedB] = await Promise.all([
          eventsACollector.eventsPromise,
          eventsBCollector.eventsPromise,
        ])

        expect(hasTurnCancelled(collectedA, promptA.turnId)).toBe(false)
        expect(hasTurnStarted(collectedA, promptA.turnId)).toBe(true)
        expect(hasTurnCompleted(collectedA, promptA.turnId)).toBe(true)

        expect(hasTurnStarted(collectedB, promptB.turnId)).toBe(true)
        expect(hasTerminalTurn(collectedB, promptB.turnId)).toBe(true)

        await waitForSessionState(app, sessionA.id, "idle")
        await waitForSessionState(app, sessionB.id, "idle")

        // Cancel a fresh turn.
        const cancelCollector = collectEventsUntil({
          url: `${wsUrl}?sessionId=${sessionB.id}`,
          timeoutMs: 60_000,
          until: (events) => events.some((event) => event.type === "turn.cancelled"),
        })
        await cancelCollector.whenOpen

        const cancelPromptResponse = await fetch(
          `${httpBase}/v1/sessions/${sessionB.id}/prompt`,
          {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              text: "Count from 1 to 100 slowly. Put each number on its own line.",
            }),
          },
        )
        expect(cancelPromptResponse.status).toBe(202)
        const cancelPrompt = PromptSessionResponseSchema.parse(
          await cancelPromptResponse.json(),
        )
        knownTurnIds.push(cancelPrompt.turnId)

        await waitFor(
          async () => (await sessionState(app, sessionB.id)) === "running",
          30_000,
          "session B running before cancel",
        )

        const cancelResponse = await fetch(`${httpBase}/v1/sessions/${sessionB.id}/cancel`, {
          method: "POST",
        })
        expect(cancelResponse.status).toBe(202)
        const cancelBody = CancelSessionResponseSchema.parse(await cancelResponse.json())
        expect(cancelBody.turnId).toBe(cancelPrompt.turnId)

        const cancelEvents = await cancelCollector.eventsPromise
        expect(hasTurnCancelled(cancelEvents, cancelPrompt.turnId)).toBe(true)

        await waitForSessionState(app, sessionB.id, "idle")

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

          const restartedUrls = getBoundUrls(restarted.app, config)
          const replayed = await collectReplayEvents({
            url: `${restartedUrls.wsUrl}?cursor=0`,
            idleMs: 500,
            timeoutMs: 30_000,
          })

          expect(replayed.length).toBeGreaterThan(0)
          expect(
            replayed.some(
              (event) =>
                event.type === "turn.started"
                && knownTurnIds.includes(event.payload.turnId),
            ),
          ).toBe(true)
          expect(
            replayed.some(
              (event) =>
                event.sessionId === sessionA.id || event.sessionId === sessionB.id,
            ),
          ).toBe(true)

          const resumeResponse = await restarted.app.inject({
            method: "POST",
            url: `/v1/sessions/${sessionA.id}/resume`,
          })
          // Resume when supported (200). Honest fallback (409) while session/load fails.
          if (resumeResponse.statusCode === 200) {
            const resumed = SessionSchema.parse(JSON.parse(resumeResponse.body))
            expect(resumed.id).toBe(sessionA.id)
            expect(["idle", "running", "offline"]).toContain(resumed.state)
          } else {
            assertHonestResumeFallback({
              statusCode: resumeResponse.statusCode,
              body: resumeResponse.body,
            })
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
    { timeout: 180_000 },
  )
})
