import {
  SessionCommandParamsSchema,
  SessionCommandQuerySchema,
} from "contracts/http/session.stream"
import { FastifyInstance } from "fastify"
import { TouchDeviceLastSeen } from "core/device/ports"
import { getRequestPrincipal } from "../auth/middleware"
import { buildUnauthorizedProblem } from "../auth/problems"
import { touchDeviceLastSeenTolerant } from "../device/device.connection.lifecycle"
import { registerDevicePresence } from "../device/device.presence"
import { sendProblem } from "../error/send.problem"
import { SessionCwdCache, SessionHub } from "./hub/hub"
import { buildSessionNotFoundProblem } from "./session.problems"

export const DEFAULT_SSE_HEARTBEAT_MS = 25_000

type RegisterSessionStreamSseRoutesParams = {
  sessionHub: SessionHub
  cwdCache: SessionCwdCache
  touchDeviceLastSeen: TouchDeviceLastSeen
  /** Interval for `: ping` comments that keep proxies from buffering the stream. */
  sseHeartbeatMs?: number
}

/**
 * Server→client session events as an SSE stream at
 * `GET /v1/sessions/:sessionId/events?agentId=…`. Opening the stream is the
 * subscribe: the hub loads and replays, then sends `subscribed` last. Changing
 * the watched session means closing this stream and opening another.
 */
export const registerSessionStreamSseRoutes = (
  app: FastifyInstance,
  params: RegisterSessionStreamSseRoutesParams,
) => {
  const heartbeatMs = params.sseHeartbeatMs ?? DEFAULT_SSE_HEARTBEAT_MS
  const forceClosers = new Set<() => void>()

  app.addHook("onClose", (_instance, done) => {
    for (const close of forceClosers) {
      close()
    }
    done()
  })

  app.get("/v1/sessions/:sessionId/events", async (request, reply) => {
    const routeParams = SessionCommandParamsSchema.parse(request.params)
    const query = SessionCommandQuerySchema.parse(request.query)
    const agentId = query.agentId
    const sessionId = routeParams.sessionId
    const lastEventIdHeader = request.headers["last-event-id"]
    const lastEventId = Array.isArray(lastEventIdHeader) ? lastEventIdHeader[0] : lastEventIdHeader

    const principal = getRequestPrincipal(request)
    if (principal === undefined) {
      return sendProblem(reply, 401, buildUnauthorizedProblem())
    }

    if (params.cwdCache.get({ agentId, sessionId }) === undefined) {
      return sendProblem(reply, 404, buildSessionNotFoundProblem("Unknown session cwd"))
    }

    reply.hijack()
    reply.raw.writeHead(200, {
      "content-type": "text/event-stream",
      "cache-control": "no-cache",
      connection: "keep-alive",
      "x-accel-buffering": "no",
    })

    const deviceId = principal.kind === "device" ? principal.deviceId : undefined
    if (deviceId !== undefined) {
      touchDeviceLastSeenTolerant({
        touchDeviceLastSeen: params.touchDeviceLastSeen,
        deviceId,
      })
    }
    const unregisterPresence =
      deviceId === undefined
        ? () => {}
        : registerDevicePresence({
            deviceId,
            connection: {
              close: () => {
                reply.raw.destroy()
              },
            },
          })

    const subscriberId = crypto.randomUUID()
    let ended = false
    const heartbeat = setInterval(() => {
      if (!reply.raw.writableEnded && !reply.raw.destroyed) {
        reply.raw.write(": ping\n\n")
      }
    }, heartbeatMs)

    const forceClose = () => {
      reply.raw.destroy()
    }
    forceClosers.add(forceClose)

    const teardown = () => {
      if (ended) {
        return
      }
      ended = true
      clearInterval(heartbeat)
      forceClosers.delete(forceClose)
      params.sessionHub.removeSubscriber(subscriberId)
      unregisterPresence()
      if (deviceId !== undefined) {
        touchDeviceLastSeenTolerant({
          touchDeviceLastSeen: params.touchDeviceLastSeen,
          deviceId,
        })
      }
    }

    request.raw.on("close", teardown)
    reply.raw.on("close", teardown)
    reply.raw.on("error", teardown)

    params.sessionHub.addSubscriber({
      id: subscriberId,
      sessionKey: null,
      sink: {
        send: (message, options) => {
          if (reply.raw.writableEnded || reply.raw.destroyed) {
            return
          }
          const idLine = options?.cursor === undefined ? "" : `id: ${options.cursor}\n`
          reply.raw.write(`${idLine}data: ${JSON.stringify(message)}\n\n`)
        },
      },
    })

    await params.sessionHub.subscribe({
      subscriberId,
      agentId,
      sessionId,
      ...(lastEventId === undefined ? {} : { lastEventId }),
    })
    if (params.sessionHub.getSubscriberSession(subscriberId) === null) {
      // Subscribe failed: the hub already flushed an error event to the stream.
      reply.raw.end()
      teardown()
    }
  })
}
