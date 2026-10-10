import { describe, expect, test } from "bun:test"
import { mkdir, readFile, writeFile } from "node:fs/promises"
import path from "node:path"
import { AttachmentDescriptorSchema } from "contracts/http/attachments"
import { ConflictProblemSchema, ValidationProblemSchema } from "contracts/http/error"
import { CreateSessionResponseSchema } from "contracts/http/session"
import { WhichFn } from "core/agent-settings/resolve-agent-path"
import { bootTestApp, TestApp } from "../test-support/test.harness"
import { allowWorkspaceRoots, enableAgent } from "../test-support/test.app"

const authHeaders = (app: { deviceCredential: { credential: string } }) => ({
  authorization: `Bearer ${app.deviceCredential.credential}`,
})

const whichFn: WhichFn = (binaryName) =>
  binaryName === "agent" ? "/usr/local/bin/agent" : undefined

const bootAttachmentApp = async () => {
  const booted = await bootTestApp({
    whichFn,
    fakeAcpOptions: {
      capabilities: { loadSession: true, sessionClose: true, sessionList: true },
      sessionNewSessionId: "fake-session-new",
      sessionLoadSessionId: "fake-session-new",
    },
  })
  await enableAgent(booted.app, "cursor", whichFn)
  return booted
}

/**
 * Starts a session in `folder` the way an agent owns it: Harold never registers a workspace.
 */
const createSessionIn = async (app: TestApp["app"], folder: string) => {
  await mkdir(folder, { recursive: true })
  const response = await app.inject({
    headers: authHeaders(app),
    method: "POST",
    url: "/v1/sessions",
    payload: { agentId: "cursor", cwd: folder },
  })
  expect(response.statusCode).toBe(201)
  return CreateSessionResponseSchema.parse(JSON.parse(response.body)).sessionId
}

const createSessionInAllowedFolder = async (app: TestApp["app"], dataDir: string) => {
  const folder = path.join(dataDir, "project")
  await allowWorkspaceRoots(app, [dataDir])
  return { sessionId: await createSessionIn(app, folder), folder }
}

const MULTIPART_BOUNDARY = "----agentservertestboundary"

const makeMultipartBody = (
  file: { fileName: string; mimeType: string; bytes: Uint8Array },
  fields: Array<{ name: string; value: string }> = [],
): { payload: Buffer; contentType: string } => {
  const chunks: Uint8Array[] = []
  const enc = (text: string) => new TextEncoder().encode(text)
  for (const field of fields) {
    chunks.push(
      enc(
        `--${MULTIPART_BOUNDARY}\r\nContent-Disposition: form-data; name="${field.name}"\r\n\r\n${field.value}\r\n`,
      ),
    )
  }
  chunks.push(
    enc(
      `--${MULTIPART_BOUNDARY}\r\nContent-Disposition: form-data; name="file"; filename="${file.fileName}"\r\nContent-Type: ${file.mimeType}\r\n\r\n`,
    ),
    file.bytes,
    enc(`\r\n--${MULTIPART_BOUNDARY}--\r\n`),
  )
  return {
    payload: Buffer.concat(chunks),
    contentType: `multipart/form-data; boundary=${MULTIPART_BOUNDARY}`,
  }
}

const uploadAttachment = (
  app: TestApp["app"],
  sessionId: string,
  options: { fileName: string; mimeType: string; bytes: Uint8Array; kind?: string },
  query: Record<string, string> = { agentId: "cursor" },
) => {
  const { payload, contentType } = makeMultipartBody(
    options,
    options.kind !== undefined ? [{ name: "kind", value: options.kind }] : [],
  )
  return app.inject({
    method: "POST",
    url: `/v1/sessions/${sessionId}/attachments`,
    query,
    payload,
    headers: {
      authorization: `Bearer ${app.deviceCredential.credential}`,
      "content-type": contentType,
    },
  })
}

const listWorkspaceCount = async (app: TestApp["app"]) => {
  const response = await app.inject({
    headers: authHeaders(app),
    method: "GET",
    url: "/v1/workspaces",
  })
  return (JSON.parse(response.body) as { items: unknown[] }).items.length
}

describe("POST /v1/sessions/:sessionId/attachments", () => {
  test("stores the file in the session folder and returns a descriptor", async () => {
    const { app, dataDir } = await bootAttachmentApp()
    const { sessionId, folder } = await createSessionInAllowedFolder(app, dataDir)

    const response = await uploadAttachment(app, sessionId, {
      fileName: "shot.png",
      mimeType: "image/png",
      bytes: new Uint8Array([1, 2, 3, 4]),
    })

    expect(response.statusCode).toBe(201)
    const descriptor = AttachmentDescriptorSchema.parse(JSON.parse(response.body))
    expect(descriptor.kind).toBe("image")
    expect(descriptor.path.startsWith(path.join(folder, ".harold", "attachments"))).toBe(true)
    expect(readFile(descriptor.path)).resolves.toEqual(new Uint8Array([1, 2, 3, 4]))
  })

  test("does not need a registered workspace and does not create one", async () => {
    const { app, dataDir } = await bootAttachmentApp()
    const { sessionId } = await createSessionInAllowedFolder(app, dataDir)
    expect(await listWorkspaceCount(app)).toBe(0)

    const response = await uploadAttachment(app, sessionId, {
      fileName: "notes.md",
      mimeType: "text/markdown",
      bytes: new Uint8Array([1]),
    })

    expect(response.statusCode).toBe(201)
    expect(await listWorkspaceCount(app)).toBe(0)
  })

  test("accepts a session folder below an allowed root", async () => {
    const { app, dataDir } = await bootAttachmentApp()
    await allowWorkspaceRoots(app, [dataDir])
    const folder = path.join(dataDir, "sites", "deep", "project")
    const sessionId = await createSessionIn(app, folder)

    const response = await uploadAttachment(app, sessionId, {
      fileName: "notes.md",
      mimeType: "text/markdown",
      bytes: new Uint8Array([1]),
    })

    expect(response.statusCode).toBe(201)
  })

  test("patches an existing .gitignore on upload", async () => {
    const { app, dataDir } = await bootAttachmentApp()
    const { sessionId, folder } = await createSessionInAllowedFolder(app, dataDir)
    await writeFile(path.join(folder, ".gitignore"), "node_modules\n", "utf8")

    const response = await uploadAttachment(app, sessionId, {
      fileName: "notes.md",
      mimeType: "text/markdown",
      bytes: new Uint8Array([1]),
    })

    expect(response.statusCode).toBe(201)
    const gitignore = await readFile(path.join(folder, ".gitignore"), "utf8")
    expect(gitignore).toBe("node_modules\n.harold/attachments/\n")
  })

  test("never creates a .gitignore when the folder has none", async () => {
    const { app, dataDir } = await bootAttachmentApp()
    const { sessionId, folder } = await createSessionInAllowedFolder(app, dataDir)

    const response = await uploadAttachment(app, sessionId, {
      fileName: "notes.md",
      mimeType: "text/markdown",
      bytes: new Uint8Array([1]),
    })

    expect(response.statusCode).toBe(201)
    expect(readFile(path.join(folder, ".gitignore"), "utf8")).rejects.toThrow()
  })

  test("returns 404 for an unknown session", async () => {
    const { app, dataDir } = await bootAttachmentApp()
    await createSessionInAllowedFolder(app, dataDir)

    const response = await uploadAttachment(app, "ses_missing", {
      fileName: "notes.md",
      mimeType: "text/markdown",
      bytes: new Uint8Array([1]),
    })

    expect(response.statusCode).toBe(404)
  })

  test("returns 409 when the session folder is outside the allowed roots", async () => {
    const { app, dataDir } = await bootAttachmentApp()
    await mkdir(path.join(dataDir, "allowed"), { recursive: true })
    await allowWorkspaceRoots(app, [path.join(dataDir, "allowed")])
    const sessionId = await createSessionIn(app, path.join(dataDir, "elsewhere"))

    const response = await uploadAttachment(app, sessionId, {
      fileName: "notes.md",
      mimeType: "text/markdown",
      bytes: new Uint8Array([1]),
    })

    expect(response.statusCode).toBe(409)
    ConflictProblemSchema.parse(JSON.parse(response.body))
    expect(readFile(path.join(dataDir, "elsewhere", ".harold", "attachments"))).rejects.toThrow()
  })

  test("returns 400 when agentId is missing", async () => {
    const { app, dataDir } = await bootAttachmentApp()
    const { sessionId } = await createSessionInAllowedFolder(app, dataDir)

    const response = await uploadAttachment(
      app,
      sessionId,
      { fileName: "notes.md", mimeType: "text/markdown", bytes: new Uint8Array([1]) },
      {},
    )

    const body = ValidationProblemSchema.parse(JSON.parse(response.body))
    expect(response.statusCode).toBe(400)
    expect(body.errors[0]?.pointer).toBe("#/agentId")
  })

  test("returns 400 when the sessionId param is empty", async () => {
    const { app } = await bootAttachmentApp()

    const response = await app.inject({
      method: "POST",
      url: "/v1/sessions//attachments",
      query: { agentId: "cursor" },
      payload: Buffer.alloc(0),
      headers: {
        authorization: `Bearer ${app.deviceCredential.credential}`,
        "content-type": "multipart/form-data",
      },
    })

    const body = ValidationProblemSchema.parse(JSON.parse(response.body))
    expect(response.statusCode).toBe(400)
    expect(body.errors[0]?.pointer).toBe("#/sessionId")
  })

  test("returns 415 for executable extensions", async () => {
    const { app, dataDir } = await bootAttachmentApp()
    const { sessionId } = await createSessionInAllowedFolder(app, dataDir)

    const response = await uploadAttachment(app, sessionId, {
      fileName: "evil.exe",
      mimeType: "application/octet-stream",
      bytes: new Uint8Array([1]),
    })

    expect(response.statusCode).toBe(415)
  })
})

describe("DELETE /v1/sessions/:sessionId/attachments/:attachmentId", () => {
  const deleteAttachment = (app: TestApp["app"], sessionId: string, attachmentId: string) =>
    app.inject({
      headers: authHeaders(app),
      method: "DELETE",
      url: `/v1/sessions/${sessionId}/attachments/${attachmentId}`,
      query: { agentId: "cursor" },
    })

  test("removes a stored attachment", async () => {
    const { app, dataDir } = await bootAttachmentApp()
    const { sessionId } = await createSessionInAllowedFolder(app, dataDir)
    const uploaded = await uploadAttachment(app, sessionId, {
      fileName: "notes.md",
      mimeType: "text/markdown",
      bytes: new Uint8Array([1]),
    })
    const descriptor = AttachmentDescriptorSchema.parse(JSON.parse(uploaded.body))

    const response = await deleteAttachment(app, sessionId, path.basename(descriptor.path))

    expect(response.statusCode).toBe(204)
    expect(readFile(descriptor.path)).rejects.toThrow()
  })

  test("returns 400 when the attachmentId param is empty", async () => {
    const { app, dataDir } = await bootAttachmentApp()
    const { sessionId } = await createSessionInAllowedFolder(app, dataDir)

    const response = await deleteAttachment(app, sessionId, "")

    const body = ValidationProblemSchema.parse(JSON.parse(response.body))
    expect(response.statusCode).toBe(400)
    expect(body.errors[0]?.pointer).toBe("#/attachmentId")
  })

  test("returns 404 for an unknown session", async () => {
    const { app, dataDir } = await bootAttachmentApp()
    await createSessionInAllowedFolder(app, dataDir)

    const response = await deleteAttachment(app, "ses_missing", "att_MISSING9.txt")

    expect(response.statusCode).toBe(404)
  })

  test("returns 404 for an unknown attachment id", async () => {
    const { app, dataDir } = await bootAttachmentApp()
    const { sessionId } = await createSessionInAllowedFolder(app, dataDir)

    const response = await deleteAttachment(app, sessionId, "att_MISSING9.txt")

    expect(response.statusCode).toBe(404)
  })

  test("returns 404 for an id shaped like a traversal", async () => {
    const { app, dataDir } = await bootAttachmentApp()
    const { sessionId } = await createSessionInAllowedFolder(app, dataDir)

    const response = await deleteAttachment(app, sessionId, encodeURIComponent("../secret.txt"))

    expect(response.statusCode).toBe(404)
  })
})
