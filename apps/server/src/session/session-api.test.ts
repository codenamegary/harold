import { afterEach, describe, expect, test } from "bun:test"
import { mkdir, mkdtemp, rm } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import {
  ConflictProblemSchema,
  NotFoundProblemSchema,
  ValidationProblemSchema,
} from "contracts/http/error"
import { SessionSchema } from "contracts/http/session"
import { createServer } from "../bootstrap/create-server"
import { parseConfig } from "../config/config"
import { openDatabase } from "../persistence/open-database"
import { createRuntime } from "../runtime/runtime"
import { WhichFn } from "../agent-settings/resolve-agent-path"
import { ValidateExecutablePathFn } from "../agent-settings/validate-agent-path"

const tempDirs: string[] = []
const apps: Awaited<ReturnType<typeof createServer>>["app"][] = []

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

const createTestApp = async (
  dataDir: string,
  whichFn?: WhichFn,
  validateExecutablePathFn: ValidateExecutablePathFn = acceptTestExecutablePath,
) => {
  const config = parseConfig({
    AGENT_SERVER_HOST: "127.0.0.1",
    AGENT_SERVER_PORT: "0",
    AGENT_SERVER_DATA_DIR: dataDir,
  })
  const database = openDatabase({ dataDir: config.dataDir })
  const runtime = createRuntime("0.1.0")
  const { app } = await createServer({
    config,
    runtime,
    database,
    whichFn,
    validateExecutablePathFn,
  })
  apps.push(app)
  return { app, database, config }
}

afterEach(async () => {
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
    expect(body.state).toBe("starting")
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
