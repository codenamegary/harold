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
import { touchDeviceLastSeenTolerant } from "../device/device.connection.lifecycle"
import {
  FindDeviceByCredentialHash,
  TouchDeviceLastSeen,
} from "../device/device.ports"
import { registerDevicePresence } from "../device/device.presence"
import { SessionHub } from "./hub/hub"

export const SESSIONS_STREAM_PATH = "/v1/sessions/stream"

type RegisterSessionStreamRoutesParams = {
  findDeviceByCredentialHash: FindDeviceByCredentialHash
  touchDeviceLastSeen: TouchDeviceLastSeen
  sessionHub: SessionHub
  getTrustedProxies?: () => readonly string[]
  isLoopbackRequest?: (request: FastifyRequest) => boolean
  wsAuthFrameTimeoutMs?: number
}

const resolveStreamPrincipal = async (params: {
  request: FastifyRequest
  socket: WebSocket
  findDeviceByCredentialHash: FindDeviceByCredentialHash
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
    lookupByCredentialHash: params.findDeviceByCredentialHash,
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
  touchDeviceLastSeen: TouchDeviceLastSeen
}): void => {
  if (params.principal.kind !== "device") {
    return
  }

  const deviceId = params.principal.deviceId
  touchDeviceLastSeenTolerant({
    touchDeviceLastSeen: params.touchDeviceLastSeen,
    deviceId,
  })

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
    touchDeviceLastSeenTolerant({
      touchDeviceLastSeen: params.touchDeviceLastSeen,
      deviceId,
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
          findDeviceByCredentialHash: params.findDeviceByCredentialHash,
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
          touchDeviceLastSeen: params.touchDeviceLastSeen,
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
            const parseResult = (() => {
              try {
                const value: unknown = JSON.parse(websocketRawDataText(data))
                return {
                  ok: true as const,
                  value,
                }
              } catch {
                return { ok: false as const }
              }
            })()

            if (!parseResult.ok) {
              sendJson(socket, {
                type: "error",
                message: "Invalid JSON",
              })
              return
            }

            const messageResult = SessionStreamClientMessageSchema.safeParse(parseResult.value)
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
                  ...(message.attachments !== undefined &&
                  message.attachments.length > 0
                    ? { attachments: message.attachments }
                    : {}),
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
              case "extension_reply":
                params.sessionHub.resolveExtensionReply({
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
