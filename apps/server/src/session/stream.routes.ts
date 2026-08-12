import { FastifyInstance, FastifyRequest } from "fastify"
import { WebSocket } from "ws"
import {
  SessionStreamClientMessageSchema,
  SessionStreamServerMessage,
} from "contracts/http/session.stream"
import { authorizeActiveFullOperator } from "../auth/authorize"
import { getRequestPrincipal } from "../auth/middleware"
import { isHostPrincipalRequest } from "../auth/request.origin"
import {
  DEFAULT_WS_AUTH_FRAME_TIMEOUT_MS,
  waitForAuthFrame,
} from "../auth/ws.auth"
import { hostPrincipal, Principal } from "../auth/principal"
import { websocketRawDataText } from "../auth/websocket.raw.data.text"
import { emitDeviceConnectionLifecycle } from "../device/connection.lifecycle"
import { DeviceRepository } from "../device/repository"
import { registerDevicePresence } from "../device/presence"
import { AgentDatabase } from "../persistence/database"
import { EventCommitPublisher } from "../event/commit.publisher"
import { EventJournalRepository } from "../event/journal.repository"
import { SessionHub } from "./hub/session.hub"

export const SESSIONS_STREAM_PATH = "/v1/sessions/stream"

type RegisterSessionStreamRoutesParams = {
  database: AgentDatabase
  eventJournal: EventJournalRepository
  commitPublisher: EventCommitPublisher
  deviceRepository: DeviceRepository
  sessionHub: SessionHub
  getTrustedProxies?: () => readonly string[]
  isLoopbackRequest?: (request: FastifyRequest) => boolean
  wsAuthFrameTimeoutMs?: number
}

const resolveStreamPrincipal = async (params: {
  request: FastifyRequest
  socket: WebSocket
  deviceRepository: DeviceRepository
  isLoopback: boolean
  timeoutMs: number
}): Promise<Principal | undefined> => {
  const existing = getRequestPrincipal(params.request)
  if (existing !== undefined && authorizeActiveFullOperator(existing)) {
    return existing
  }

  if (params.isLoopback) {
    return existing ?? hostPrincipal()
  }

  const frameResult = await waitForAuthFrame({
    socket: params.socket,
    timeoutMs: params.timeoutMs,
    lookupByCredentialHash: (credentialHash) =>
      params.deviceRepository.getByCredentialHash({ credentialHash }),
  })

  if (!frameResult.ok) {
    params.socket.close(1008, "unauthorized")
    return undefined
  }

  return frameResult.principal
}

const attachDevicePresence = (params: {
  principal: Principal
  socket: WebSocket
  database: AgentDatabase
  eventJournal: EventJournalRepository
  commitPublisher: EventCommitPublisher
  deviceRepository: DeviceRepository
}): void => {
  if (params.principal.kind !== "device") {
    return
  }

  const deviceId = params.principal.deviceId
  const connected = emitDeviceConnectionLifecycle({
    database: params.database,
    eventJournal: params.eventJournal,
    commitPublisher: params.commitPublisher,
    deviceRepository: params.deviceRepository,
    deviceId,
    kind: "device.connected",
  })

  if (!connected.ok) {
    params.socket.close(1011, "device connect event failed")
    return
  }

  const unregisterPresence = registerDevicePresence({
    deviceId,
    connection: params.socket,
  })
  const closedConnections = new WeakSet<object>()

  const onClose = () => {
    if (closedConnections.has(params.socket)) {
      return
    }
    closedConnections.add(params.socket)
    unregisterPresence()
    emitDeviceConnectionLifecycle({
      database: params.database,
      eventJournal: params.eventJournal,
      commitPublisher: params.commitPublisher,
      deviceRepository: params.deviceRepository,
      deviceId,
      kind: "device.disconnected",
    })
  }

  params.socket.on("close", onClose)
  params.socket.on("error", onClose)
}

const sendJson = (socket: WebSocket, message: SessionStreamServerMessage) => {
  if (socket.readyState !== socket.OPEN) {
    return
  }
  socket.send(JSON.stringify(message))
}

export const registerSessionStreamRoutes = (
  app: FastifyInstance,
  params: RegisterSessionStreamRoutesParams,
) => {
  const resolveHostPrincipal =
    params.isLoopbackRequest ??
    ((request: FastifyRequest) =>
      isHostPrincipalRequest(request, params.getTrustedProxies?.() ?? []))
  const timeoutMs = params.wsAuthFrameTimeoutMs ?? DEFAULT_WS_AUTH_FRAME_TIMEOUT_MS

  app.route({
    method: "GET",
    url: SESSIONS_STREAM_PATH,
    handler: (_request, reply) => {
      reply.code(426).send({ message: "Upgrade Required" })
    },
    wsHandler: (socket, request) => {
      void (async () => {
        const principal = await resolveStreamPrincipal({
          request,
          socket,
          deviceRepository: params.deviceRepository,
          isLoopback: resolveHostPrincipal(request),
          timeoutMs,
        })

        if (principal === undefined || !authorizeActiveFullOperator(principal)) {
          if (socket.readyState === socket.OPEN || socket.readyState === socket.CONNECTING) {
            socket.close(1008, "unauthorized")
          }
          return
        }

        attachDevicePresence({
          principal,
          socket,
          database: params.database,
          eventJournal: params.eventJournal,
          commitPublisher: params.commitPublisher,
          deviceRepository: params.deviceRepository,
        })

        const subscriberId = crypto.randomUUID()
        params.sessionHub.addSubscriber({
          id: subscriberId,
          sessionKey: null,
          sink: {
            send: (message) => sendJson(socket, message),
          },
        })

        socket.on("message", (data) => {
          void (async () => {
            let parsed: unknown
            try {
              parsed = JSON.parse(websocketRawDataText(data))
            } catch {
              sendJson(socket, {
                type: "error",
                message: "Invalid JSON",
              })
              return
            }

            const messageResult = SessionStreamClientMessageSchema.safeParse(parsed)
            if (!messageResult.success) {
              sendJson(socket, {
                type: "error",
                message: "Invalid session stream message",
              })
              return
            }

            const message = messageResult.data
            switch (message.type) {
              case "subscribe":
                await params.sessionHub.subscribe({
                  subscriberId,
                  agentId: message.agentId,
                  sessionId: message.sessionId,
                })
                return
              case "switch":
                await params.sessionHub.switchSession({
                  subscriberId,
                  agentId: message.agentId,
                  sessionId: message.sessionId,
                })
                return
              case "prompt":
                await params.sessionHub.prompt({
                  subscriberId,
                  agentId: message.agentId,
                  sessionId: message.sessionId,
                  text: message.text,
                })
                return
              case "cancel":
                await params.sessionHub.cancel({
                  subscriberId,
                  agentId: message.agentId,
                  sessionId: message.sessionId,
                })
                return
              case "permission_reply":
                params.sessionHub.resolvePermissionReply({
                  requestId: message.requestId,
                  optionId: message.optionId,
                })
                return
              case "cursor_reply":
                params.sessionHub.resolveCursorReply({
                  requestId: message.requestId,
                  result: message.result,
                })
                return
            }
          })()
        })

        socket.on("close", () => {
          params.sessionHub.removeSubscriber(subscriberId)
        })
      })()
    },
  })
}
