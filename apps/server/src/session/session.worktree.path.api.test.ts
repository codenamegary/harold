import { describe, expect, test } from "bun:test"
import { mkdir, writeFile } from "node:fs/promises"
import path from "node:path"
import { NotFoundProblemSchema, ValidationProblemSchema } from "contracts/http/error"
import {
  CreateSessionResponseSchema,
  SessionCollectionSchema,
  SetSessionWorktreePathBodySchema,
} from "contracts/http/session"
import { sessionEventsPath } from "contracts/http/session.stream"
import { WhichFn } from "core/agent-settings/resolve-agent-path"
import { openSseStream } from "test-support/session-stream"
import { sessionWorktreePath } from "../persistence/schema/session.worktree.path"
import { enableAgent } from "../test-support/test.app"
import { bootTestApp } from "../test-support/test.harness"

const whichFn: WhichFn = (binaryName) =>
  binaryName === "agent" ? "/usr/local/bin/agent" : undefined

const authHeaders = (app: { deviceCredential: { credential: string } }) => ({
  authorization: `Bearer ${app.deviceCredential.credential}`,
})

const git = async (cwd: string, ...args: ReadonlyArray<string>) => {
  const result = Bun.spawn(["git", "-C", cwd, ...args], {
    stdout: "pipe",
    stderr: "pipe",
  })
  const [code, , stderr] = await Promise.all([
    result.exited,
    new Response(result.stdout).text(),
    new Response(result.stderr).text(),
  ])
  if (code !== 0) {
    throw new Error(`git ${args.join(" ")} failed: ${stderr}`)
  }
}

const createRepo = async (parent: string) => {
  const repo = path.join(parent, "repo")
  await mkdir(repo, { recursive: true })
  await writeFile(path.join(repo, "README.md"), "# repo\n")
  await git(repo, "init", "--quiet", "--initial-branch=main")
  await git(repo, "config", "user.email", "test@harold.local")
  await git(repo, "config", "user.name", "Harold")
  await git(repo, "add", ".")
  await git(repo, "commit", "--quiet", "-m", "init")
  return repo
}

const createSession = async (app: Awaited<ReturnType<typeof bootTestApp>>["app"], cwd: string) => {
  const response = await app.inject({
    headers: authHeaders(app),
    method: "POST",
    url: "/v1/sessions",
    payload: { agentId: "cursor", cwd },
  })
  expect(response.statusCode).toBe(201)
  return CreateSessionResponseSchema.parse(JSON.parse(response.body))
}

const listSessions = async (app: Awaited<ReturnType<typeof bootTestApp>>["app"]) => {
  const response = await app.inject({
    headers: authHeaders(app),
    method: "GET",
    url: "/v1/sessions",
  })
  expect(response.statusCode).toBe(200)
  return SessionCollectionSchema.parse(JSON.parse(response.body))
}

const setWorktreePath = (
  app: Awaited<ReturnType<typeof bootTestApp>>["app"],
  sessionId: string,
  body: unknown,
) =>
  app.inject({
    headers: authHeaders(app),
    method: "PUT",
    url: `/v1/sessions/${encodeURIComponent(sessionId)}/worktree-path`,
    payload: body,
  })

type ListeningApp = {
  listen: (opts: { host: string; port: number }) => Promise<string>
  server: { address: () => unknown }
}

const getHttpBase = async (app: ListeningApp, host: string) => {
  await app.listen({ host, port: 0 })
  const address = app.server.address()
  if (
    address === null ||
    typeof address !== "object" ||
    !("port" in address) ||
    typeof address.port !== "number"
  ) {
    throw new Error("expected bound server address")
  }
  return `http://${host}:${address.port}`
}

describe("session worktree path API", () => {
  test("create returns null and the list includes the stored path", async () => {
    const { app, dataDir } = await bootTestApp({
      whichFn,
      fakeAcpOptions: {
        capabilities: { loadSession: true, sessionClose: true, sessionList: true },
        sessionNewSessionId: "worktree-path-1",
      },
    })
    await enableAgent(app, "cursor", whichFn)
    const repo = await createRepo(dataDir)
    const linked = path.join(dataDir, "linked")
    await git(repo, "worktree", "add", "--quiet", linked, "-b", "feat/linked")

    const created = await createSession(app, repo)
    expect(created.worktreePath).toBeNull()

    const response = await setWorktreePath(app, created.sessionId, {
      agentId: "cursor",
      worktreePath: linked,
    })
    expect(response.statusCode).toBe(204)

    const listed = await listSessions(app)
    expect(listed.items).toEqual([
      expect.objectContaining({
        agentId: "cursor",
        sessionId: created.sessionId,
        worktreePath: linked,
      }),
    ])
  })

  test("manual selection broadcasts session_worktree_path", async () => {
    const { app, config, dataDir } = await bootTestApp({
      whichFn,
      fakeAcpOptions: {
        capabilities: { loadSession: true, sessionClose: true, sessionList: true },
        sessionNewSessionId: "worktree-path-sse",
      },
    })
    await enableAgent(app, "cursor", whichFn)
    const repo = await createRepo(dataDir)
    const linked = path.join(dataDir, "linked")
    await git(repo, "worktree", "add", "--quiet", linked, "-b", "feat/linked")
    const created = await createSession(app, repo)
    const httpBase = await getHttpBase(app, config.host)

    const stream = await openSseStream({
      url: `${httpBase}${sessionEventsPath(created.sessionId, { agentId: "cursor" })}`,
      credential: app.deviceCredential.credential,
    })
    await stream.waitFor((message) => message.type === "subscribed")

    const response = await setWorktreePath(app, created.sessionId, {
      agentId: "cursor",
      worktreePath: linked,
    })
    expect(response.statusCode).toBe(204)

    const event = await stream.waitFor((message) => message.type === "session_worktree_path")
    expect(event).toEqual({
      type: "session_worktree_path",
      agentId: "cursor",
      sessionId: created.sessionId,
      worktreePath: linked,
    })
    await stream.close()
  }, 30_000)

  test("clears the stored path with null", async () => {
    const { app, dataDir } = await bootTestApp({
      whichFn,
      fakeAcpOptions: {
        capabilities: { loadSession: true, sessionClose: true, sessionList: true },
        sessionNewSessionId: "worktree-path-clear",
      },
    })
    await enableAgent(app, "cursor", whichFn)
    const repo = await createRepo(dataDir)
    await git(repo, "worktree", "add", "--quiet", path.join(dataDir, "linked"), "-b", "feat/linked")
    const created = await createSession(app, repo)
    await setWorktreePath(app, created.sessionId, {
      agentId: "cursor",
      worktreePath: path.join(dataDir, "linked"),
    })

    const response = await setWorktreePath(app, created.sessionId, {
      agentId: "cursor",
      worktreePath: null,
    })

    expect(response.statusCode).toBe(204)
    expect((await listSessions(app)).items[0]?.worktreePath).toBeNull()
  })

  test("rejects a path that is not a listed worktree", async () => {
    const { app, dataDir } = await bootTestApp({
      whichFn,
      fakeAcpOptions: {
        capabilities: { loadSession: true, sessionClose: true, sessionList: true },
        sessionNewSessionId: "worktree-path-invalid",
      },
    })
    await enableAgent(app, "cursor", whichFn)
    const repo = await createRepo(dataDir)
    const created = await createSession(app, repo)

    const response = await setWorktreePath(app, created.sessionId, {
      agentId: "cursor",
      worktreePath: path.join(dataDir, "not-a-worktree"),
    })

    expect(response.statusCode).toBe(422)
    expect(() => ValidationProblemSchema.parse(JSON.parse(response.body))).not.toThrow()
  })

  test("returns 404 for an unknown session", async () => {
    const { app } = await bootTestApp({ whichFn })
    await enableAgent(app, "cursor", whichFn)

    const response = await setWorktreePath(app, "missing-session", {
      agentId: "cursor",
      worktreePath: null,
    })

    expect(response.statusCode).toBe(404)
    expect(() => NotFoundProblemSchema.parse(JSON.parse(response.body))).not.toThrow()
  })

  test("rejects an unknown agent and a malformed body", async () => {
    const { app } = await bootTestApp()

    const unknownAgent = await setWorktreePath(app, "missing-session", {
      agentId: "not-an-agent",
      worktreePath: null,
    })
    expect(unknownAgent.statusCode).toBe(404)

    const malformed = await setWorktreePath(app, "missing-session", {
      worktreePath: "",
    })
    expect(malformed.statusCode).toBe(400)
    expect(() => ValidationProblemSchema.parse(JSON.parse(malformed.body))).not.toThrow()
  })

  test("delete removes the stored worktree path row", async () => {
    const { app, dataDir, database } = await bootTestApp({
      whichFn,
      fakeAcpOptions: {
        capabilities: { loadSession: true, sessionClose: true, sessionList: true },
        sessionNewSessionId: "worktree-path-delete",
      },
    })
    await enableAgent(app, "cursor", whichFn)
    const repo = await createRepo(dataDir)
    await git(repo, "worktree", "add", "--quiet", path.join(dataDir, "linked"), "-b", "feat/linked")
    const created = await createSession(app, repo)
    await setWorktreePath(app, created.sessionId, {
      agentId: "cursor",
      worktreePath: path.join(dataDir, "linked"),
    })
    expect(database.db.select().from(sessionWorktreePath).all()).toHaveLength(1)

    const response = await app.inject({
      headers: authHeaders(app),
      method: "DELETE",
      url: `/v1/sessions/${encodeURIComponent(created.sessionId)}?agentId=cursor`,
    })

    expect(response.statusCode).toBe(204)
    expect(database.db.select().from(sessionWorktreePath).all()).toEqual([])
  })

  test("the manual body contract accepts only agentId and worktreePath", () => {
    expect(() =>
      SetSessionWorktreePathBodySchema.parse({
        agentId: "cursor",
        worktreePath: null,
        sessionId: "extra",
      }),
    ).toThrow()
  })
})
