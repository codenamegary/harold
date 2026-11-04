import { identityFromCredential, parseBearerCredential } from "./demo.auth"
import { DemoAppOptions, DemoRouteContext } from "./demo.context"
import { createDemoStore, DemoStore } from "./demo.state"
import { createRateLimiter, RateLimitRule } from "./demo.rate.limit"
import { REAPER_INTERVAL_MS } from "./fixtures/demo.constants"
import { demoAttachmentResponse } from "./routes/demo.attachments.routes"
import {
  listFilesystemDirectoriesResponse,
  createFilesystemDirectoryResponse,
} from "./routes/filesystem.routes"
import {
  gitChangesResponse,
  gitFileResponse,
  gitSummaryResponse,
  gitWorktreesResponse,
} from "./routes/git.routes"
import { internalError, notFound, rateLimited, unauthorized } from "./routes/http"
import { claimPairingCodeResponse } from "./routes/pairing.routes"
import {
  deleteDeviceResponse,
  elicitationReplyResponse,
  extensionReplyResponse,
  permissionReplyResponse,
} from "./routes/replies.routes"
import {
  agentAuthResponse,
  agentSettingsResponse,
  healthResponse,
  runtimeSettingsResponse,
  statusResponse,
} from "./routes/status.routes"
import {
  cancelSessionResponse,
  createSessionResponse,
  deleteAttachmentResponse,
  deleteSessionResponse,
  listSessionsResponse,
  promptSessionResponse,
  setConfigOptionResponse,
  setWorktreePathResponse,
  uploadAttachmentResponse,
} from "./routes/sessions.routes"
import { createSessionStreamResponse } from "./sse/session.stream"
import {
  createWorkspaceResponse,
  deleteWorkspaceResponse,
  getWorkspaceResponse,
  listWorkspacesResponse,
  renameWorkspaceResponse,
} from "./routes/workspaces.routes"

type BunServerLike = {
  requestIP: (request: Request) => { address: string } | null
}

type DemoRateLimits = {
  claim: RateLimitRule
  prompt: RateLimitRule
  sse: RateLimitRule
}

export type DemoApp = {
  store: DemoStore
  fetch: (request: Request, server?: BunServerLike) => Promise<Response>
  stop: () => void
}

export type StartDemoServerParams = {
  hostname: string
  port: number
  options?: DemoAppOptions
}

const defaultRateLimits: DemoRateLimits = {
  claim: { limit: 60, windowMs: 60_000 },
  prompt: { limit: 120, windowMs: 60_000 },
  sse: { limit: 120, windowMs: 60_000 },
}

const requestIp = (request: Request, server?: BunServerLike): string => {
  if (server !== undefined) {
    try {
      const address = server.requestIP(request)?.address
      if (address !== undefined && address.length > 0) {
        return address
      }
    } catch {
      // Fall through to the header/default.
    }
  }
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown"
}

const decodeSegment = (value: string): string | null => {
  try {
    const decoded = decodeURIComponent(value)
    return decoded.length === 0 ? null : decoded
  } catch {
    return null
  }
}

export const createDemoApp = (options: DemoAppOptions = {}): DemoApp => {
  const store = createDemoStore({
    ...(options.now === undefined ? {} : { now: options.now }),
    ...(options.maxDevices === undefined ? {} : { maxDevices: options.maxDevices }),
    ...(options.maxSessionsPerDevice === undefined
      ? {}
      : { maxSessionsPerDevice: options.maxSessionsPerDevice }),
  })

  const limits: DemoRateLimits = {
    claim: options.claimRateLimit ?? defaultRateLimits.claim,
    prompt: options.promptRateLimit ?? defaultRateLimits.prompt,
    sse: options.sseRateLimit ?? defaultRateLimits.sse,
  }
  const claimLimiter = createRateLimiter(limits.claim, store.now)
  const promptLimiter = createRateLimiter(limits.prompt, store.now)
  const sseLimiter = createRateLimiter(limits.sse, store.now)

  const reaper = setInterval(() => store.reap(), options.reaperIntervalMs ?? REAPER_INTERVAL_MS)
  ;(reaper as { unref?: () => void }).unref?.()

  const stop = (): void => {
    clearInterval(reaper)
  }

  const contextFor = (request: Request, url: URL, deviceId: string): DemoRouteContext => ({
    store,
    request,
    url,
    deviceId,
    options,
  })

  const dispatchAuthenticated = async (context: DemoRouteContext): Promise<Response> => {
    const { request, url } = context
    const path = url.pathname
    const method = request.method.toUpperCase()

    if (method === "GET" && path === "/v1/settings/runtime") {
      return runtimeSettingsResponse()
    }
    if (method === "GET" && path === "/v1/settings/agents") {
      return agentSettingsResponse()
    }

    const agentAuth = /^\/v1\/agents\/([^/]+)\/auth$/.exec(path)
    if (method === "GET" && agentAuth?.[1] !== undefined) {
      const agentId = decodeSegment(agentAuth[1])
      return agentId === null ? notFound("Agent not found") : agentAuthResponse(agentId)
    }

    if (method === "GET" && path === "/v1/workspaces") {
      return listWorkspacesResponse(context)
    }
    if (method === "POST" && path === "/v1/workspaces") {
      return createWorkspaceResponse(context)
    }
    const workspace = /^\/v1\/workspaces\/([^/]+)$/.exec(path)
    if (workspace?.[1] !== undefined) {
      const workspaceId = decodeSegment(workspace[1])
      if (workspaceId === null) {
        return notFound("Workspace not found")
      }
      if (method === "GET") {
        return getWorkspaceResponse(context, workspaceId)
      }
      if (method === "PATCH") {
        return renameWorkspaceResponse(context, workspaceId)
      }
      if (method === "DELETE") {
        return deleteWorkspaceResponse(context, workspaceId)
      }
    }

    if (method === "GET" && path === "/v1/filesystem/directories") {
      return listFilesystemDirectoriesResponse(context)
    }
    if (method === "POST" && path === "/v1/filesystem/directories") {
      return createFilesystemDirectoryResponse(context)
    }

    if (method === "GET" && path === "/v1/sessions") {
      return listSessionsResponse(context)
    }
    if (method === "POST" && path === "/v1/sessions") {
      return createSessionResponse(context)
    }

    const sessionRoute = /^\/v1\/sessions\/([^/]+)(?:\/([^/]+))?(?:\/([^/]+))?$/.exec(path)
    if (sessionRoute?.[1] !== undefined) {
      const sessionId = decodeSegment(sessionRoute[1])
      const action = sessionRoute[2]
      const tail = sessionRoute[3]
      if (sessionId === null) {
        return notFound("Session not found")
      }

      if (action === undefined && method === "DELETE") {
        return deleteSessionResponse(context, sessionId)
      }
      if (action === "worktree-path" && tail === undefined && method === "PUT") {
        return setWorktreePathResponse(context, sessionId)
      }
      if (action === "config-options" && tail !== undefined && method === "PUT") {
        const configId = decodeSegment(tail)
        return configId === null
          ? notFound("Config option not found")
          : setConfigOptionResponse(context, sessionId, configId)
      }
      if (action === "events" && tail === undefined && method === "GET") {
        const agentId = url.searchParams.get("agentId")
        const session = store.getSession(context.deviceId, sessionId)
        if (session === undefined || agentId === null || agentId !== session.agentId) {
          return notFound("Session not found")
        }
        return createSessionStreamResponse({
          store,
          deviceId: context.deviceId,
          session,
          request,
          ...(options.heartbeatMs === undefined ? {} : { heartbeatMs: options.heartbeatMs }),
        })
      }
      if (action === "prompts" && tail === undefined && method === "POST") {
        return promptSessionResponse(context, sessionId)
      }
      if (action === "cancel" && tail === undefined && method === "POST") {
        return cancelSessionResponse(context, sessionId)
      }
      if (action === "attachments" && tail === undefined && method === "POST") {
        return uploadAttachmentResponse(context, sessionId)
      }
      if (action === "attachments" && tail !== undefined && method === "DELETE") {
        const attachmentId = decodeSegment(tail)
        return attachmentId === null
          ? notFound("Attachment not found")
          : deleteAttachmentResponse(context, sessionId, attachmentId)
      }
    }

    const reply = /^\/v1\/(permissions|elicitations|extensions)\/([^/]+)\/replies$/.exec(path)
    if (method === "POST" && reply?.[1] !== undefined && reply[2] !== undefined) {
      const requestId = decodeSegment(reply[2])
      if (requestId === null) {
        return notFound("Request not found")
      }
      if (reply[1] === "permissions") {
        return permissionReplyResponse(context, requestId)
      }
      if (reply[1] === "elicitations") {
        return elicitationReplyResponse(context, requestId)
      }
      return extensionReplyResponse(context, requestId)
    }

    if (method === "GET" && path === "/v1/git/summary") {
      return gitSummaryResponse(context)
    }
    if (method === "GET" && path === "/v1/git/worktrees") {
      return gitWorktreesResponse(context)
    }
    if (method === "GET" && path === "/v1/git/changes") {
      return gitChangesResponse(context)
    }
    if (method === "GET" && path === "/v1/git/file") {
      return gitFileResponse(context)
    }

    const device = /^\/v1\/devices\/([^/]+)$/.exec(path)
    if (method === "DELETE" && device?.[1] !== undefined) {
      const deviceId = decodeSegment(device[1])
      return deviceId === null
        ? notFound("Device not found")
        : deleteDeviceResponse(context, deviceId)
    }

    return notFound()
  }

  const fetch = async (request: Request, server?: BunServerLike): Promise<Response> => {
    try {
      const url = new URL(request.url)
      const path = url.pathname
      const method = request.method.toUpperCase()

      if (method === "GET" && path === "/healthz") {
        return healthResponse()
      }
      if (method === "GET" && path === "/v1/status") {
        return statusResponse()
      }
      if (method === "GET" && path.startsWith("/demo/attachments/")) {
        const response = demoAttachmentResponse(path)
        return response ?? notFound("Demo attachment not found")
      }

      const claim = /^\/v1\/pairing-codes\/([^/]+)\/claim$/.exec(path)
      if (method === "POST" && claim?.[1] !== undefined) {
        const ip = requestIp(request, server)
        if (!claimLimiter.allow(ip)) {
          return rateLimited("Too many pairing attempts")
        }
        const code = decodeSegment(claim[1])
        if (code === null) {
          return notFound("Pairing code not found")
        }
        return claimPairingCodeResponse({ request, store, code })
      }

      if (!path.startsWith("/v1/")) {
        return notFound()
      }

      const credential = parseBearerCredential(request.headers.get("authorization"))
      const identity = credential === null ? null : identityFromCredential(credential)
      if (identity === null) {
        return unauthorized()
      }

      const ensured = store.ensureDevice(identity.deviceId)
      if (!ensured.ok) {
        return rateLimited("The demo server is at its device limit")
      }
      store.touchDevice(identity.deviceId)

      if (method === "POST" && path.endsWith("/prompts")) {
        if (!promptLimiter.allow(requestIp(request, server))) {
          return rateLimited("Too many prompts")
        }
      }
      if (method === "GET" && path.endsWith("/events")) {
        if (!sseLimiter.allow(requestIp(request, server))) {
          return rateLimited("Too many stream connections")
        }
      }

      return await dispatchAuthenticated(contextFor(request, url, identity.deviceId))
    } catch (error) {
      console.error(
        "demo request failed:",
        error instanceof Error ? error.message : "unknown error",
      )
      return internalError()
    }
  }

  return { store, fetch, stop }
}

export const startDemoServer = (params: StartDemoServerParams) => {
  const app = createDemoApp(params.options)
  const server = Bun.serve({
    hostname: params.hostname,
    port: params.port,
    fetch: app.fetch,
    // Bun's default 10 second idle timeout kills a quiet SSE stream. Heartbeats
    // keep it active, and the platform maximum avoids closing a waiting panel.
    idleTimeout: 255,
  })
  return {
    app,
    server,
    url: `http://${params.hostname}:${server.port}`,
    stop: () => {
      app.stop()
      void server.stop(true)
    },
  }
}
