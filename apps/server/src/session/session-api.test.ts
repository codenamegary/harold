import { afterEach, describe, expect, test } from "bun:test"
import { mkdir, mkdtemp, rm } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import {
  ConflictProblemSchema,
  NotFoundProblemSchema,
  ValidationProblemSchema,
} from "contracts/http/error"
import { SessionCollectionSchema, SessionSchema } from "contracts/http/session"
import { spawnFakeAcp } from "test-support/spawn"
import { createServer } from "../bootstrap/create-server"
import { parseConfig } from "../config/config"
import { openDatabase } from "../persistence/open-database"
import { createRuntime } from "../runtime/runtime"
import { WhichFn } from "../agent-settings/resolve-agent-path"
import { ValidateExecutablePathFn } from "../agent-settings/validate-agent-path"
import { SpawnedAgentProcess } from "../acp/supervisor/spawn-agent-process"

const tempDirs: string[] = []
const apps: Awaited<ReturnType<typeof createServer>>["app"][] = []
const fakeProcesses: Array<{ kill: () => void }> = []

const createTempDataDir = async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "agent-server-session-api-"))
  tempDirs.push(dir)
  return dir
}

const createWorkspaceDir = async (parent: string, name: string) => {
  const dir = path.join(parent, name)
  await mkdir(dir)
  return dir
}

const acceptTestExecutablePath: ValidateExecutablePathFn = () => true

const createFakeSpawnFn = (
  fakeOptions: Parameters<typeof spawnFakeAcp>[0] = {},
) => {
  const spawnAgentProcessFn = (): SpawnedAgentProcess => {
    const fake = spawnFakeAcp(fakeOptions)
    fakeProcesses.push(fake)
    return {
      stdin: fake.stdin,
      stdout: fake.stdout,
      kill: () => {
        fake.kill()
      },
      waitForExit: () => fake.process.exited,
    }
  }

  return { spawnAgentProcessFn }
}

const createTestApp = async (
  dataDir: string,
  whichFn?: WhichFn,
  validateExecutablePathFn: ValidateExecutablePathFn = acceptTestExecutablePath,
  fakeAcpOptions: Parameters<typeof spawnFakeAcp>[0] = {
    capabilities: { loadSession: true, sessionClose: true },
    sessionNewSessionId: "fake-session-new",
    sessionLoadSessionId: "fake-session-new",
  },
) => {
  const config = parseConfig({
    AGENT_SERVER_HOST: "127.0.0.1",
    AGENT_SERVER_PORT: "0",
    AGENT_SERVER_DATA_DIR: dataDir,
  })
  const database = openDatabase({ dataDir: config.dataDir })
  const runtime = createRuntime("0.1.0")
  const { spawnAgentProcessFn } = createFakeSpawnFn(fakeAcpOptions)
  const { app } = await createServer({
    config,
    runtime,
    database,
    whichFn,
    validateExecutablePathFn,
    spawnAgentProcessFn,
  })
  apps.push(app)
  return { app, database, config }
}

afterEach(async () => {
  fakeProcesses.splice(0).forEach((process) => process.kill())
  await Promise.all(apps.splice(0).map((app) => app.close()))
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })))
})

const seedWorkspace = async (
  app: Awaited<ReturnType<typeof createServer>>["app"],
  dataDir: string,
) => {
  const workspaceDir = await createWorkspaceDir(dataDir, "project")
  const response = await app.inject({
    method: "POST",
    url: "/v1/workspaces",
    payload: { name: "Project", path: workspaceDir },
  })
  const workspace = JSON.parse(response.body) as { id: string }
  return { workspaceId: workspace.id, workspaceDir }
}

const enableAgent = async (
  app: Awaited<ReturnType<typeof createServer>>["app"],
  agentId: "cursor" | "claude",
  whichFn?: WhichFn,
) => {
  const detectedPath = "/usr/local/bin/agent"
  const resolvedWhichFn: WhichFn =
    whichFn ?? ((binaryName) => (binaryName === "agent" ? detectedPath : undefined))

  if (agentId === "cursor") {
    const response = await app.inject({
      method: "PATCH",
      url: "/v1/settings/agents/cursor",
      payload: { enabled: true, path: resolvedWhichFn("agent") ?? detectedPath },
    })
    expect(response.statusCode).toBe(200)
  }
}

describe("POST /v1/sessions", () => {
  test("returns 201 with SessionSchema when workspace and agent are valid", async () => {
    const dataDir = await createTempDataDir()
    const detectedPath = "/usr/local/bin/agent"
    const whichFn: WhichFn = (binaryName) =>
      binaryName === "agent" ? detectedPath : undefined
    const { app } = await createTestApp(dataDir, whichFn)
    const { workspaceId } = await seedWorkspace(app, dataDir)

    await enableAgent(app, "cursor", whichFn)

    const response = await app.inject({
      method: "POST",
      url: "/v1/sessions",
      payload: {
        workspaceId,
        agentId: "cursor",
        name: "Debug auth",
      },
    })

    const body = SessionSchema.parse(JSON.parse(response.body))

    expect(response.statusCode).toBe(201)
    expect(body.workspaceId).toBe(workspaceId)
    expect(body.agentId).toBe("cursor")
    expect(body.name).toBe("Debug auth")
    expect(body.state).toBe("idle")
    expect(body.id).toMatch(/^sess_[0-9A-HJKMNP-TV-Z]{26}$/)
    expect("acpSessionId" in body).toBe(false)
  })

  test("returns 400 for invalid agent id", async () => {
    const dataDir = await createTempDataDir()
    const { app } = await createTestApp(dataDir)
    const { workspaceId } = await seedWorkspace(app, dataDir)

    const response = await app.inject({
      method: "POST",
      url: "/v1/sessions",
      payload: {
        workspaceId,
        agentId: "unknown",
        name: "Debug auth",
      },
    })

    const body = ValidationProblemSchema.parse(JSON.parse(response.body))

    expect(response.statusCode).toBe(400)
    expect(response.headers["content-type"]).toStartWith("application/problem+json")
    expect(body.errors[0]?.pointer).toBe("#/agentId")
  })

  test("returns 404 for unknown workspace", async () => {
    const dataDir = await createTempDataDir()
    const detectedPath = "/usr/local/bin/agent"
    const whichFn: WhichFn = (binaryName) =>
      binaryName === "agent" ? detectedPath : undefined
    const { app } = await createTestApp(dataDir, whichFn)

    await enableAgent(app, "cursor", whichFn)

    const response = await app.inject({
      method: "POST",
      url: "/v1/sessions",
      payload: {
        workspaceId: "ws_01J0000000000000000000000",
        agentId: "cursor",
        name: "Debug auth",
      },
    })

    const body = NotFoundProblemSchema.parse(JSON.parse(response.body))

    expect(response.statusCode).toBe(404)
    expect(body.title).toBe("Workspace not found")
  })

  test("returns 409 when agent is unavailable", async () => {
    const dataDir = await createTempDataDir()
    const { app } = await createTestApp(dataDir)
    const { workspaceId } = await seedWorkspace(app, dataDir)

    const response = await app.inject({
      method: "POST",
      url: "/v1/sessions",
      payload: {
        workspaceId,
        agentId: "claude",
        name: "Claude session",
      },
    })

    const body = ConflictProblemSchema.parse(JSON.parse(response.body))

    expect(response.statusCode).toBe(409)
    expect(body.title).toBe("Agent is not available")
  })

  test("returns 409 when agent is disabled", async () => {
    const dataDir = await createTempDataDir()
    const { app } = await createTestApp(dataDir)
    const { workspaceId } = await seedWorkspace(app, dataDir)

    const response = await app.inject({
      method: "POST",
      url: "/v1/sessions",
      payload: {
        workspaceId,
        agentId: "cursor",
        name: "Debug auth",
      },
    })

    const body = ConflictProblemSchema.parse(JSON.parse(response.body))

    expect(response.statusCode).toBe(409)
    expect(body.title).toBe("Agent is disabled")
  })

  test("returns 400 for empty name", async () => {
    const dataDir = await createTempDataDir()
    const detectedPath = "/usr/local/bin/agent"
    const whichFn: WhichFn = (binaryName) =>
      binaryName === "agent" ? detectedPath : undefined
    const { app } = await createTestApp(dataDir, whichFn)
    const { workspaceId } = await seedWorkspace(app, dataDir)

    await enableAgent(app, "cursor", whichFn)

    const response = await app.inject({
      method: "POST",
      url: "/v1/sessions",
      payload: {
        workspaceId,
        agentId: "cursor",
        name: "",
      },
    })

    expect(response.statusCode).toBe(400)
    ValidationProblemSchema.parse(JSON.parse(response.body))
  })
})

describe("session lifecycle", () => {
  test("create, list, get, rename, select, archive, and resume conflicts", async () => {
    const dataDir = await createTempDataDir()
    const detectedPath = "/usr/local/bin/agent"
    const whichFn: WhichFn = (binaryName) =>
      binaryName === "agent" ? detectedPath : undefined
    const { app } = await createTestApp(dataDir, whichFn, acceptTestExecutablePath, {
      capabilities: { loadSession: true, sessionClose: true },
      sessionNewSessionId: "lifecycle-session",
      sessionLoadSessionId: "lifecycle-session",
    })
    const { workspaceId } = await seedWorkspace(app, dataDir)
    await enableAgent(app, "cursor", whichFn)

    const workspaceBefore = await app.inject({
      method: "GET",
      url: `/v1/workspaces/${workspaceId}`,
    })
    const workspaceBeforeBody = JSON.parse(workspaceBefore.body) as { lastUsedAt: string }

    const createResponse = await app.inject({
      method: "POST",
      url: "/v1/sessions",
      payload: {
        workspaceId,
        agentId: "cursor",
        name: "Lifecycle session",
      },
    })
    const created = SessionSchema.parse(JSON.parse(createResponse.body))
    expect(createResponse.statusCode).toBe(201)
    expect(created.state).toBe("idle")

    const listResponse = await app.inject({
      method: "GET",
      url: `/v1/sessions?workspaceId=${workspaceId}`,
    })
    const listed = SessionCollectionSchema.parse(JSON.parse(listResponse.body))
    expect(listResponse.statusCode).toBe(200)
    expect(listed.items).toHaveLength(1)
    expect(listed.items[0]?.id).toBe(created.id)

    const getResponse = await app.inject({
      method: "GET",
      url: `/v1/sessions/${created.id}`,
    })
    const fetched = SessionSchema.parse(JSON.parse(getResponse.body))
    expect(getResponse.statusCode).toBe(200)
    expect(fetched.name).toBe("Lifecycle session")

    const renameResponse = await app.inject({
      method: "PATCH",
      url: `/v1/sessions/${created.id}`,
      payload: { name: "Renamed session" },
    })
    const renamed = SessionSchema.parse(JSON.parse(renameResponse.body))
    expect(renameResponse.statusCode).toBe(200)
    expect(renamed.name).toBe("Renamed session")

    const selectResponse = await app.inject({
      method: "POST",
      url: `/v1/sessions/${created.id}/select`,
    })
    const selected = SessionSchema.parse(JSON.parse(selectResponse.body))
    expect(selectResponse.statusCode).toBe(200)
    expect(selected.lastUsedAt).not.toBe(created.lastUsedAt)

    const workspaceAfterSelect = await app.inject({
      method: "GET",
      url: `/v1/workspaces/${workspaceId}`,
    })
    const workspaceAfterSelectBody = JSON.parse(workspaceAfterSelect.body) as { lastUsedAt: string }
    expect(workspaceAfterSelectBody.lastUsedAt).toBe(selected.lastUsedAt)
    expect(workspaceAfterSelectBody.lastUsedAt).not.toBe(workspaceBeforeBody.lastUsedAt)

    const archiveResponse = await app.inject({
      method: "POST",
      url: `/v1/sessions/${created.id}/archive`,
    })
    const archived = SessionSchema.parse(JSON.parse(archiveResponse.body))
    expect(archiveResponse.statusCode).toBe(200)
    expect(archived.state).toBe("archived")
    expect(archived.archivedAt).not.toBeNull()

    const archiveAgainResponse = await app.inject({
      method: "POST",
      url: `/v1/sessions/${created.id}/archive`,
    })
    const archiveAgainBody = ConflictProblemSchema.parse(JSON.parse(archiveAgainResponse.body))
    expect(archiveAgainResponse.statusCode).toBe(409)
    expect(archiveAgainBody.title).toBe("Session is archived")

    const resumeArchivedResponse = await app.inject({
      method: "POST",
      url: `/v1/sessions/${created.id}/resume`,
    })
    const resumeArchivedBody = ConflictProblemSchema.parse(JSON.parse(resumeArchivedResponse.body))
    expect(resumeArchivedResponse.statusCode).toBe(409)
    expect(resumeArchivedBody.title).toBe("Session is archived")
  })

  test("resume returns idle session when loadSession is supported", async () => {
    const dataDir = await createTempDataDir()
    const detectedPath = "/usr/local/bin/agent"
    const whichFn: WhichFn = (binaryName) =>
      binaryName === "agent" ? detectedPath : undefined
    const { app } = await createTestApp(dataDir, whichFn, acceptTestExecutablePath, {
      capabilities: { loadSession: true, sessionClose: false },
      sessionNewSessionId: "resumable-session",
      sessionLoadSessionId: "resumable-session",
    })
    const { workspaceId } = await seedWorkspace(app, dataDir)
    await enableAgent(app, "cursor", whichFn)

    const createResponse = await app.inject({
      method: "POST",
      url: "/v1/sessions",
      payload: {
        workspaceId,
        agentId: "cursor",
        name: "Resumable",
      },
    })
    const created = SessionSchema.parse(JSON.parse(createResponse.body))

    const resumeResponse = await app.inject({
      method: "POST",
      url: `/v1/sessions/${created.id}/resume`,
    })
    const resumed = SessionSchema.parse(JSON.parse(resumeResponse.body))
    expect(resumeResponse.statusCode).toBe(200)
    expect(resumed.state).toBe("idle")
  })

  test("resume returns 409 when agent does not support loadSession", async () => {
    const dataDir = await createTempDataDir()
    const detectedPath = "/usr/local/bin/agent"
    const whichFn: WhichFn = (binaryName) =>
      binaryName === "agent" ? detectedPath : undefined
    const { app } = await createTestApp(dataDir, whichFn, acceptTestExecutablePath, {
      capabilities: { loadSession: false, sessionClose: false },
      sessionNewSessionId: "non-resumable-session",
    })
    const { workspaceId } = await seedWorkspace(app, dataDir)
    await enableAgent(app, "cursor", whichFn)

    const createResponse = await app.inject({
      method: "POST",
      url: "/v1/sessions",
      payload: {
        workspaceId,
        agentId: "cursor",
        name: "Non-resumable",
      },
    })
    const created = SessionSchema.parse(JSON.parse(createResponse.body))

    const resumeResponse = await app.inject({
      method: "POST",
      url: `/v1/sessions/${created.id}/resume`,
    })
    const body = ConflictProblemSchema.parse(JSON.parse(resumeResponse.body))
    expect(resumeResponse.statusCode).toBe(409)
    expect(body.title).toBe("Session is not resumable")
  })

  test("archive skips session/close when agent does not advertise close", async () => {
    const dataDir = await createTempDataDir()
    const detectedPath = "/usr/local/bin/agent"
    const whichFn: WhichFn = (binaryName) =>
      binaryName === "agent" ? detectedPath : undefined
    const { app } = await createTestApp(dataDir, whichFn, acceptTestExecutablePath, {
      capabilities: { loadSession: false, sessionClose: false },
      sessionNewSessionId: "metadata-archive-session",
    })
    const { workspaceId } = await seedWorkspace(app, dataDir)
    await enableAgent(app, "cursor", whichFn)

    const createResponse = await app.inject({
      method: "POST",
      url: "/v1/sessions",
      payload: {
        workspaceId,
        agentId: "cursor",
        name: "Metadata archive",
      },
    })
    const created = SessionSchema.parse(JSON.parse(createResponse.body))

    const archiveResponse = await app.inject({
      method: "POST",
      url: `/v1/sessions/${created.id}/archive`,
    })
    const archived = SessionSchema.parse(JSON.parse(archiveResponse.body))
    expect(archiveResponse.statusCode).toBe(200)
    expect(archived.state).toBe("archived")
  })

  test("returns 404 for unknown session", async () => {
    const dataDir = await createTempDataDir()
    const { app } = await createTestApp(dataDir)

    const response = await app.inject({
      method: "GET",
      url: "/v1/sessions/sess_01J0000000000000000000000",
    })

    const body = NotFoundProblemSchema.parse(JSON.parse(response.body))
    expect(response.statusCode).toBe(404)
    expect(body.title).toBe("Session not found")
  })

  test("returns 400 for invalid list cursor", async () => {
    const dataDir = await createTempDataDir()
    const detectedPath = "/usr/local/bin/agent"
    const whichFn: WhichFn = (binaryName) =>
      binaryName === "agent" ? detectedPath : undefined
    const { app } = await createTestApp(dataDir, whichFn)
    const { workspaceId } = await seedWorkspace(app, dataDir)

    const response = await app.inject({
      method: "GET",
      url: `/v1/sessions?workspaceId=${workspaceId}&cursor=not-a-cursor`,
    })

    const body = ValidationProblemSchema.parse(JSON.parse(response.body))
    expect(response.statusCode).toBe(400)
    expect(body.errors[0]?.pointer).toBe("#/cursor")
  })
})
