import { afterEach, describe, expect, test } from "bun:test"
import { mkdtemp, readFile, rm } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { AttachmentDescriptorSchema } from "contracts/http/attachments"
import { createServer } from "../bootstrap/server"
import { parseConfig } from "../config/config"
import { openDatabase } from "../persistence/database"
import { createRuntime } from "../runtime/runtime"
import { allowWorkspaceRoots } from "../test-support/create-test-app"

const tempDirs: string[] = []
const apps: Awaited<ReturnType<typeof createServer>>["app"][] = []

const createTempDataDir = async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "agent-server-att-api-"))
  tempDirs.push(dir)
  return dir
}

const createTestApp = async (dataDir: string) => {
  const config = parseConfig({
    AGENT_SERVER_HOST: "127.0.0.1",
    AGENT_SERVER_PORT: "0",
    AGENT_SERVER_DATA_DIR: dataDir,
  })
  const database = openDatabase({ dataDir: config.dataDir })
  const runtime = createRuntime("0.1.0")
  const { app } = await createServer({ config, runtime, database })
  apps.push(app)
  return { app }
}

const createWorkspace = async (
  app: Awaited<ReturnType<typeof createServer>>["app"],
  dataDir: string,
) => {
  const workspaceDir = path.join(dataDir, "project")
  await (await import("node:fs/promises")).mkdir(workspaceDir, { recursive: true })
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
  app: Awaited<ReturnType<typeof createServer>>["app"],
  workspaceId: string,
  options: { fileName: string; mimeType: string; bytes: Uint8Array; kind?: string },
) => {
  const { payload, contentType } = makeMultipartBody(options,
    options.kind !== undefined ? [{ name: "kind", value: options.kind }] : [],
  )
  return app.inject({
    method: "POST",
    url: `/v1/workspaces/${workspaceId}/attachments`,
    payload,
    headers: { "content-type": contentType },
  })
}

afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()))
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })))
})

describe("POST /v1/workspaces/:workspaceId/attachments", () => {
  test("stores the file and returns a descriptor", async () => {
    const dataDir = await createTempDataDir()
    const { app } = await createTestApp(dataDir)
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
    expect(descriptor.path.startsWith(
      path.join(workspaceDir, ".agent-server", "attachments"),
    )).toBe(true)
    await expect(readFile(descriptor.path)).resolves.toEqual(new Uint8Array([1, 2, 3, 4]))
  })

  test("patches an existing workspace .gitignore on upload", async () => {
    const dataDir = await createTempDataDir()
    const { app } = await createTestApp(dataDir)
    const { workspaceId, workspaceDir } = await createWorkspace(app, dataDir)
    await (await import("node:fs/promises")).writeFile(
      path.join(workspaceDir, ".gitignore"),
      "node_modules\n",
      "utf8",
    )

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
    const dataDir = await createTempDataDir()
    const { app } = await createTestApp(dataDir)
    const { workspaceId, workspaceDir } = await createWorkspace(app, dataDir)

    const response = await uploadAttachment(app, workspaceId, {
      fileName: "notes.md",
      mimeType: "text/markdown",
      bytes: new Uint8Array([1]),
    })

    expect(response.statusCode).toBe(201)
    await expect(readFile(path.join(workspaceDir, ".gitignore"), "utf8")).rejects.toThrow()
  })

  test("returns 404 for an unknown workspace", async () => {
    const dataDir = await createTempDataDir()
    const { app } = await createTestApp(dataDir)

    const response = await uploadAttachment(app, "ws_missing", {
      fileName: "notes.md",
      mimeType: "text/markdown",
      bytes: new Uint8Array([1]),
    })

    expect(response.statusCode).toBe(404)
  })

  test("returns 415 for executable extensions", async () => {
    const dataDir = await createTempDataDir()
    const { app } = await createTestApp(dataDir)
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
    const dataDir = await createTempDataDir()
    const { app } = await createTestApp(dataDir)
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
    await expect(readFile(descriptor.path)).rejects.toThrow()
  })

  test("returns 404 for an unknown attachment id", async () => {
    const dataDir = await createTempDataDir()
    const { app } = await createTestApp(dataDir)
    const { workspaceId } = await createWorkspace(app, dataDir)

    const response = await app.inject({
      method: "DELETE",
      url: `/v1/workspaces/${workspaceId}/attachments/att_MISSING9.txt`,
    })

    expect(response.statusCode).toBe(404)
  })

  test("returns 404 for an id shaped like a traversal", async () => {
    const dataDir = await createTempDataDir()
    const { app } = await createTestApp(dataDir)
    const { workspaceId } = await createWorkspace(app, dataDir)

    const response = await app.inject({
      method: "DELETE",
      url: `/v1/workspaces/${workspaceId}/attachments/${encodeURIComponent("../secret.txt")}`,
    })

    expect(response.statusCode).toBe(404)
  })
})
