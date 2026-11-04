import { describe, expect, test } from "bun:test"
import { join } from "node:path"
import { AgentAuthSchema } from "contracts/http/agent-auth"
import { AgentSettingsCollectionSchema } from "contracts/http/agent-settings"
import { AttachmentDescriptorSchema } from "contracts/http/attachments"
import { DeviceCredentialResponseSchema } from "contracts/http/device"
import { ProblemDetailsSchema } from "contracts/http/error"
import {
  CreateFilesystemDirectoryBodySchema,
  FilesystemDirectoryCollectionSchema,
  FilesystemDirectoryCreatedSchema,
} from "contracts/http/filesystem.browse"
import {
  GitChangesSchema,
  GitFileDiffSchema,
  GitSummarySchema,
  GitWorktreeCollectionSchema,
} from "contracts/http/git"
import { RuntimeSettingsViewSchema } from "contracts/http/runtime-settings"
import {
  CreateSessionBodySchema,
  CreateSessionResponseSchema,
  SessionCollectionSchema,
  SetSessionWorktreePathBodySchema,
} from "contracts/http/session"
import { LivenessSchema } from "contracts/http/status"
import {
  CreateWorkspaceBodySchema,
  UpdateWorkspaceBodySchema,
  WorkspaceCollectionSchema,
  WorkspaceSchema,
} from "contracts/http/workspace"
import {
  AURORA_FEATURE_WORKTREE_PATH,
  AURORA_WORKSPACE_PATH,
  PIXEL_WORKSPACE_PATH,
} from "../src/fixtures/workspaces"
import { authedFetch, claimDevice, openSse, readJson, startTestServer } from "./support"

const withServer = async (
  testBody: (server: ReturnType<typeof startTestServer>) => Promise<void>,
) => {
  const server = startTestServer()
  try {
    await testBody(server)
  } finally {
    await server.stop()
  }
}

describe("demo server REST contracts", () => {
  test("health and liveness respond with their contracts", async () => {
    await withServer(async (server) => {
      const health = await fetch(`${server.url}/healthz`)
      expect(health.status).toBe(200)
      expect(await health.json()).toEqual({ ok: true })

      const status = await fetch(`${server.url}/v1/status`)
      expect(status.status).toBe(200)
      expect(await readJson(status, LivenessSchema)).toEqual({
        state: "online",
        version: "1.0.0",
      })
    })
  })

  test("serves the Play review pairing QR as a public PNG", async () => {
    await withServer(async (server) => {
      const response = await fetch(`${server.url}/review-pairing-qr.png`)
      expect(response.status).toBe(200)
      expect(response.headers.get("content-type")).toBe("image/png")

      // The route must serve the checked-in store asset byte for byte, so the
      // public URL and the file uploaded to Play cannot drift.
      const source = new Uint8Array(
        await Bun.file(
          join(import.meta.dir, "../../../docs/store-android/review-pairing-qr.png"),
        ).arrayBuffer(),
      )
      const served = new Uint8Array(await response.arrayBuffer())
      expect(Buffer.from(served).equals(Buffer.from(source))).toBe(true)
    })
  })

  test("claim ignores the body, fixes the device name, and issues a credential", async () => {
    await withServer(async (server) => {
      const claimed = await claimDevice(server, "DEM-O01", JSON.stringify({ name: "Other" }))
      expect(claimed.response.status).toBe(200)
      const body = DeviceCredentialResponseSchema.parse(claimed.json)
      expect(body.device.name).toBe("Demo device")
      expect(body.device.platform).toBe("android")
      expect(body.credential).toMatch(/^demo_[0-9a-f-]{36}$/)

      for (const permissiveCode of ["abc-def", "abc-_12", "123-abc"]) {
        const accepted = await claimDevice(server, permissiveCode)
        expect(accepted.response.status).toBe(200)
        DeviceCredentialResponseSchema.parse(accepted.json)
      }

      const invalid = await fetch(`${server.url}/v1/pairing-codes/nope/claim`, {
        method: "POST",
        body: "{}",
      })
      expect(invalid.status).toBe(400)
      ProblemDetailsSchema.parse(await invalid.json())
    })
  })

  test("the chat screen keeps the auth panel hidden because agent auth is unknown", async () => {
    await withServer(async (server) => {
      const claimed = await claimDevice(server)
      const credential = claimed.credential

      const runtime = await authedFetch(server, credential, "/v1/settings/runtime")
      expect(runtime.status).toBe(200)
      RuntimeSettingsViewSchema.parse(await runtime.json())

      const agents = await authedFetch(server, credential, "/v1/settings/agents")
      expect(agents.status).toBe(200)
      const collection = AgentSettingsCollectionSchema.parse(await agents.json())
      expect(collection.items).toHaveLength(1)
      expect(collection.items[0]?.id).toBe("opencode")
      expect(collection.items[0]?.enabled).toBe(true)
      expect(collection.items[0]?.authSummary.status).toBe("unknown")

      const auth = await authedFetch(server, credential, "/v1/agents/opencode/auth")
      expect(auth.status).toBe(200)
      const authBody = AgentAuthSchema.parse(await auth.json())
      expect(authBody.status).toBe("unknown")
      expect(authBody.session).toBeNull()
      // The chat auth panel only renders needs_auth or error. Unknown is hidden.
      expect(["needs_auth", "error"]).not.toContain(authBody.status)
    })
  })

  test("workspaces list, get, create, rename, and delete follow contracts", async () => {
    await withServer(async (server) => {
      const claimed = await claimDevice(server)
      const credential = claimed.credential

      const list = await authedFetch(server, credential, "/v1/workspaces?limit=100")
      const collection = await readJson(list, WorkspaceCollectionSchema)
      expect(collection.items.map((item) => item.name)).toEqual(["aurora-web", "pixel-garden"])
      expect(collection.page.count).toBe(2)

      const first = collection.items[0]
      expect(first).toBeDefined()
      if (first === undefined) {
        return
      }

      const get = await authedFetch(server, credential, `/v1/workspaces/${first.id}`)
      expect(WorkspaceSchema.parse(await get.json())).toEqual(first)

      const createBody = CreateWorkspaceBodySchema.parse({
        source: "folder",
        path: "/home/demo/projects/new-project",
        name: "new-project",
      })
      const created = await authedFetch(server, credential, "/v1/workspaces", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(createBody),
      })
      expect(created.status).toBe(201)
      const workspace = WorkspaceSchema.parse(await created.json())

      const renameBody = UpdateWorkspaceBodySchema.parse({ name: "renamed-project" })
      const renamed = await authedFetch(server, credential, `/v1/workspaces/${workspace.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(renameBody),
      })
      expect((await renamed.json()) as { name: string }).toMatchObject({ name: "renamed-project" })

      const deleted = await authedFetch(server, credential, `/v1/workspaces/${workspace.id}`, {
        method: "DELETE",
      })
      expect(deleted.status).toBe(204)
    })
  })

  test("filesystem browse and create return contracts", async () => {
    await withServer(async (server) => {
      const claimed = await claimDevice(server)
      const credential = claimed.credential

      const browse = await authedFetch(server, credential, "/v1/filesystem/directories")
      const listing = FilesystemDirectoryCollectionSchema.parse(await browse.json())
      expect(listing.path).toBe("/home/demo")
      expect(listing.items.map((item) => item.name)).toContain("projects")

      const body = CreateFilesystemDirectoryBodySchema.parse({
        parent: "/home/demo/projects",
        name: "demo-scratch",
      })
      const created = await authedFetch(server, credential, "/v1/filesystem/directories", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      })
      expect(created.status).toBe(201)
      const made = FilesystemDirectoryCreatedSchema.parse(await created.json())
      expect(made.path).toBe("/home/demo/projects/demo-scratch")

      const projects = await authedFetch(
        server,
        credential,
        "/v1/filesystem/directories?root=%2Fhome%2Fdemo%2Fprojects",
      )
      const after = FilesystemDirectoryCollectionSchema.parse(await projects.json())
      expect(after.items.map((item) => item.name)).toContain("demo-scratch")
    })
  })

  test("session CRUD, worktree path, and config write return contracts", async () => {
    await withServer(async (server) => {
      const claimed = await claimDevice(server)
      const credential = claimed.credential

      const list = await authedFetch(server, credential, "/v1/sessions")
      const sessions = SessionCollectionSchema.parse(await list.json())
      expect(sessions.items.map((item) => item.title)).toEqual([
        "Add dark mode toggle",
        "Fix image resize bug",
        "Review the release notes",
      ])

      const createBody = CreateSessionBodySchema.parse({
        agentId: "opencode",
        cwd: AURORA_WORKSPACE_PATH,
      })
      const created = await authedFetch(server, credential, "/v1/sessions", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(createBody),
      })
      expect(created.status).toBe(201)
      const session = CreateSessionResponseSchema.parse(await created.json())
      expect(session.configOptions).toHaveLength(3)

      const worktreeBody = SetSessionWorktreePathBodySchema.parse({
        agentId: "opencode",
        worktreePath: AURORA_FEATURE_WORKTREE_PATH,
      })
      const worktree = await authedFetch(
        server,
        credential,
        `/v1/sessions/${session.sessionId}/worktree-path`,
        {
          method: "PUT",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(worktreeBody),
        },
      )
      expect(worktree.status).toBe(204)

      const config = await authedFetch(
        server,
        credential,
        `/v1/sessions/${session.sessionId}/config-options/mode?agentId=opencode`,
        {
          method: "PUT",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ value: "plan" }),
        },
      )
      expect(config.status).toBe(202)

      const deleted = await authedFetch(
        server,
        credential,
        `/v1/sessions/${session.sessionId}?agentId=opencode`,
        { method: "DELETE" },
      )
      expect(deleted.status).toBe(204)
    })
  })

  test("attachment uploads return the image and file descriptors", async () => {
    await withServer(async (server) => {
      const claimed = await claimDevice(server)
      const credential = claimed.credential
      const sessionId = "ses_demo_add_dark_mode_toggle"

      const imageForm = new FormData()
      imageForm.append("file", new Blob(["not read"], { type: "image/png" }), "local.png")
      const imageResponse = await authedFetch(
        server,
        credential,
        `/v1/sessions/${sessionId}/attachments?agentId=opencode`,
        { method: "POST", body: imageForm },
      )
      expect(imageResponse.status).toBe(201)
      const image = AttachmentDescriptorSchema.parse(await imageResponse.json())
      expect(image).toMatchObject({
        name: "harold-logo.png",
        mimeType: "image/png",
        kind: "image",
        path: "/demo/attachments/harold-logo.png",
      })
      expect(image.size).toBeGreaterThan(0)

      const fileForm = new FormData()
      fileForm.append("file", new Blob(["not read"], { type: "text/plain" }), "notes.txt")
      const fileResponse = await authedFetch(
        server,
        credential,
        `/v1/sessions/${sessionId}/attachments?agentId=opencode`,
        { method: "POST", body: fileForm },
      )
      expect(fileResponse.status).toBe(201)
      const file = AttachmentDescriptorSchema.parse(await fileResponse.json())
      expect(file).toMatchObject({
        name: "its-not-dns.txt",
        mimeType: "text/plain",
        kind: "file",
        path: "/demo/attachments/its-not-dns.txt",
      })
      expect(file.size).toBeGreaterThan(0)

      const deleted = await authedFetch(
        server,
        credential,
        `/v1/sessions/${sessionId}/attachments/${image.id}?agentId=opencode`,
        { method: "DELETE" },
      )
      expect(deleted.status).toBe(204)
    })
  })

  test("git endpoints return contracts for both workspaces", async () => {
    await withServer(async (server) => {
      const claimed = await claimDevice(server)
      const credential = claimed.credential

      for (const path of [AURORA_WORKSPACE_PATH, PIXEL_WORKSPACE_PATH]) {
        const summary = await authedFetch(
          server,
          credential,
          `/v1/git/summary?path=${encodeURIComponent(path)}`,
        )
        const summaryBody = GitSummarySchema.parse(await summary.json())
        expect(summaryBody.repository.root).toBe(path)

        const worktrees = await authedFetch(
          server,
          credential,
          `/v1/git/worktrees?path=${encodeURIComponent(path)}`,
        )
        const worktreeBody = GitWorktreeCollectionSchema.parse(await worktrees.json())
        expect(worktreeBody.items.length).toBeGreaterThan(0)

        const changes = await authedFetch(
          server,
          credential,
          `/v1/git/changes?path=${encodeURIComponent(path)}&scope=uncommitted`,
        )
        GitChangesSchema.parse(await changes.json())

        const file = await authedFetch(
          server,
          credential,
          `/v1/git/file?path=${encodeURIComponent(path)}&scope=uncommitted&file=${encodeURIComponent("src/theme/toggle.ts")}`,
        )
        GitFileDiffSchema.parse(await file.json())
      }

      const aurora = await authedFetch(
        server,
        credential,
        `/v1/git/changes?path=${encodeURIComponent(AURORA_WORKSPACE_PATH)}&scope=uncommitted`,
      )
      expect((await aurora.json()) as { totals: { files: number } }).toMatchObject({
        totals: { files: 3 },
      })

      const pixel = await authedFetch(
        server,
        credential,
        `/v1/git/changes?path=${encodeURIComponent(PIXEL_WORKSPACE_PATH)}&scope=uncommitted`,
      )
      expect((await pixel.json()) as { files: unknown[] }).toMatchObject({ files: [] })
    })
  })

  test("demo attachment URLs serve the fake files", async () => {
    await withServer(async (server) => {
      const text = await fetch(`${server.url}/demo/attachments/its-not-dns.txt`)
      expect(await text.text()).toBe("It's not DNS.\nThere's no way it's DNS.\nIt was DNS.\n")

      const image = await fetch(`${server.url}/demo/attachments/harold-logo.png`)
      expect(image.headers.get("content-type")).toBe("image/png")
      expect((await image.arrayBuffer()).byteLength).toBeGreaterThan(0)
    })
  })

  test("unauthenticated requests get the unauthorized problem", async () => {
    await withServer(async (server) => {
      const response = await fetch(`${server.url}/v1/workspaces`)
      expect(response.status).toBe(401)
      ProblemDetailsSchema.parse(await response.json())
    })
  })

  test("removing the device state does not invalidate a stateless credential", async () => {
    await withServer(async (server) => {
      const claimed = await claimDevice(server)
      const removed = await authedFetch(
        server,
        claimed.credential,
        `/v1/devices/${claimed.deviceId}`,
        {
          method: "DELETE",
        },
      )
      expect(removed.status).toBe(204)

      const after = await authedFetch(server, claimed.credential, "/v1/workspaces")
      expect(after.status).toBe(200)
      WorkspaceCollectionSchema.parse(await after.json())
    })
  })

  test("SSE opens for a seeded session with a full replay", async () => {
    await withServer(async (server) => {
      const claimed = await claimDevice(server)
      const sse = await openSse({
        server,
        credential: claimed.credential,
        sessionId: "ses_demo_add_dark_mode_toggle",
      })
      try {
        await sse.waitFor((frame) => frame.type === "prompt_complete")
        const initial = sse.frames
        expect(initial[0]?.type).toBe("stream_reset")
        expect(initial[1]?.type).toBe("subscribed")
        expect(initial.some((frame) => frame.type === "session_config")).toBe(true)
        expect(initial.some((frame) => frame.type === "session_info")).toBe(true)
        expect(
          initial.some(
            (frame) =>
              frame.type === "session_update" &&
              typeof frame.update === "object" &&
              frame.update !== null &&
              "sessionUpdate" in frame.update &&
              frame.update.sessionUpdate === "available_commands_update",
          ),
        ).toBe(true)
        expect(initial.some((frame) => frame.type === "session_worktree_path")).toBe(true)
      } finally {
        await sse.close()
      }
    })
  })
})
