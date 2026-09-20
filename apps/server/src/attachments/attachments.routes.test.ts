import { describe, expect, test } from "bun:test"
import { mkdir, readFile, writeFile } from "node:fs/promises"
import path from "node:path"
import { AttachmentDescriptorSchema } from "contracts/http/attachments"
import { ValidationProblemSchema } from "contracts/http/error"
import { bootTestApp, TestApp } from "../test-support/test.harness"
import { allowWorkspaceRoots } from "../test-support/test.app"

const createWorkspace = async (app: TestApp["app"], dataDir: string) => {
  const workspaceDir = path.join(dataDir, "project")
  await mkdir(workspaceDir, { recursive: true })
  await allowWorkspaceRoots(app, [dataDir])
  const response = await app.inject({
    method: "POST",
    url: "/v1/workspaces",
    payload: { name: "Project", path: workspaceDir },
  })
  expect(response.statusCode).toBe(201)
  return { workspaceId: (JSON.parse(response.body) as { id: string }).id, workspaceDir }
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
  workspaceId: string,
  options: { fileName: string; mimeType: string; bytes: Uint8Array; kind?: string },
) => {
  const { payload, contentType } = makeMultipartBody(
    options,
    options.kind !== undefined ? [{ name: "kind", value: options.kind }] : [],
  )
  return app.inject({
    method: "POST",
    url: `/v1/workspaces/${workspaceId}/attachments`,
    payload,
    headers: { "content-type": contentType },
  })
}

describe("POST /v1/workspaces/:workspaceId/attachments", () => {
  test("stores the file and returns a descriptor", async () => {
    const { app, dataDir } = await bootTestApp()
    const { workspaceId, workspaceDir } = await createWorkspace(app, dataDir)

    const response = await uploadAttachment(app, workspaceId, {
      fileName: "shot.png",
      mimeType: "image/png",
      bytes: new Uint8Array([1, 2, 3, 4]),
    })

    expect(response.statusCode).toBe(201)
    const descriptor = AttachmentDescriptorSchema.parse(JSON.parse(response.body))
    expect(descriptor.workspaceId).toBe(workspaceId)
    expect(descriptor.kind).toBe("image")
    expect(
      descriptor.path.startsWith(path.join(workspaceDir, ".agent-server", "attachments")),
    ).toBe(true)
    expect(readFile(descriptor.path)).resolves.toEqual(new Uint8Array([1, 2, 3, 4]))
  })

  test("patches an existing workspace .gitignore on upload", async () => {
    const { app, dataDir } = await bootTestApp()
    const { workspaceId, workspaceDir } = await createWorkspace(app, dataDir)
    await writeFile(path.join(workspaceDir, ".gitignore"), "node_modules\n", "utf8")

    const response = await uploadAttachment(app, workspaceId, {
      fileName: "notes.md",
      mimeType: "text/markdown",
      bytes: new Uint8Array([1]),
    })

    expect(response.statusCode).toBe(201)
    const gitignore = await readFile(path.join(workspaceDir, ".gitignore"), "utf8")
    expect(gitignore).toBe("node_modules\n.agent-server/attachments/\n")
  })

  test("never creates a .gitignore when the workspace has none", async () => {
    const { app, dataDir } = await bootTestApp()
    const { workspaceId, workspaceDir } = await createWorkspace(app, dataDir)

    const response = await uploadAttachment(app, workspaceId, {
      fileName: "notes.md",
      mimeType: "text/markdown",
      bytes: new Uint8Array([1]),
    })

    expect(response.statusCode).toBe(201)
    expect(readFile(path.join(workspaceDir, ".gitignore"), "utf8")).rejects.toThrow()
  })

  test("returns 404 for an unknown workspace", async () => {
    const { app } = await bootTestApp()

    const response = await uploadAttachment(app, "ws_missing", {
      fileName: "notes.md",
      mimeType: "text/markdown",
      bytes: new Uint8Array([1]),
    })

    expect(response.statusCode).toBe(404)
  })

  test("returns 400 when the workspaceId param is empty", async () => {
    const { app } = await bootTestApp()

    const response = await app.inject({
      method: "POST",
      url: "/v1/workspaces//attachments",
      payload: Buffer.alloc(0),
      headers: { "content-type": "multipart/form-data" },
    })

    const body = ValidationProblemSchema.parse(JSON.parse(response.body))
    expect(response.statusCode).toBe(400)
    expect(body.errors[0]?.pointer).toBe("#/workspaceId")
  })

  test("returns 415 for executable extensions", async () => {
    const { app, dataDir } = await bootTestApp()
    const { workspaceId } = await createWorkspace(app, dataDir)

    const response = await uploadAttachment(app, workspaceId, {
      fileName: "evil.exe",
      mimeType: "application/octet-stream",
      bytes: new Uint8Array([1]),
    })

    expect(response.statusCode).toBe(415)
  })
})

describe("DELETE /v1/workspaces/:workspaceId/attachments/:attachmentId", () => {
  test("removes a stored attachment", async () => {
    const { app, dataDir } = await bootTestApp()
    const { workspaceId } = await createWorkspace(app, dataDir)
    const uploaded = await uploadAttachment(app, workspaceId, {
      fileName: "notes.md",
      mimeType: "text/markdown",
      bytes: new Uint8Array([1]),
    })
    const descriptor = AttachmentDescriptorSchema.parse(JSON.parse(uploaded.body))

    const response = await app.inject({
      method: "DELETE",
      url: `/v1/workspaces/${workspaceId}/attachments/${path.basename(descriptor.path)}`,
    })

    expect(response.statusCode).toBe(204)
    expect(readFile(descriptor.path)).rejects.toThrow()
  })

  test("returns 400 when the attachmentId param is empty", async () => {
    const { app, dataDir } = await bootTestApp()
    const { workspaceId } = await createWorkspace(app, dataDir)

    const response = await app.inject({
      method: "DELETE",
      url: `/v1/workspaces/${workspaceId}/attachments/`,
    })

    const body = ValidationProblemSchema.parse(JSON.parse(response.body))
    expect(response.statusCode).toBe(400)
    expect(body.errors[0]?.pointer).toBe("#/attachmentId")
  })

  test("returns 404 for an unknown attachment id", async () => {
    const { app, dataDir } = await bootTestApp()
    const { workspaceId } = await createWorkspace(app, dataDir)

    const response = await app.inject({
      method: "DELETE",
      url: `/v1/workspaces/${workspaceId}/attachments/att_MISSING9.txt`,
    })

    expect(response.statusCode).toBe(404)
  })

  test("returns 404 for an id shaped like a traversal", async () => {
    const { app, dataDir } = await bootTestApp()
    const { workspaceId } = await createWorkspace(app, dataDir)

    const response = await app.inject({
      method: "DELETE",
      url: `/v1/workspaces/${workspaceId}/attachments/${encodeURIComponent("../secret.txt")}`,
    })

    expect(response.statusCode).toBe(404)
  })
})
