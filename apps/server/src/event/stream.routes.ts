import { FastifyInstance, FastifyRequest } from "fastify"
import { WebSocket } from "ws"
import { SessionRepository } from "../session/repository"
import { SessionService } from "../session/service"
import { WorkspaceRepository } from "../workspace/repository"
import { AcpSupervisor } from "../acp/supervisor/acp-supervisor-types"
import { maybeAutoResumeSession } from "../session/resume.session"
import { authorizeActiveFullOperator } from "../auth/authorize"
import { getRequestPrincipal } from "../auth/middleware"
import { isLoopbackRequest } from "../auth/loopback"
import {
  DEFAULT_WS_AUTH_FRAME_TIMEOUT_MS,
  waitForAuthFrame,
} from "../auth/ws.auth"
import { hostPrincipal, Principal } from "../auth/principal"
import { DeviceRepository } from "../device/repository"
import { EventCommitPublisher } from "./commit.publisher"
import { EventJournalRepository } from "./journal.repository"
import { runStreamConnection } from "./stream.connection"
import {
  validateEventStreamHandshake,
  ValidatedEventStreamHandshake,
} from "./stream.handshake"

const eventStreamHandshakes = new WeakMap<object, ValidatedEventStreamHandshake>()

type RegisterEventStreamRoutesParams = {
  eventJournal: EventJournalRepository
  commitPublisher: EventCommitPublisher
  workspaceRepository: WorkspaceRepository
  sessionRepository: SessionRepository
  sessionService: SessionService
  acpSupervisor: AcpSupervisor
  deviceRepository: DeviceRepository
  isLoopbackRequest?: (request: FastifyRequest) => boolean
  wsAuthFrameTimeoutMs?: number
}

const sendProblem = (
  reply: {
    status: (code: number) => { type: (type: string) => { send: (body: unknown) => unknown } }
  },
  status: number,
  problem: unknown,
) => reply.status(status).type("application/problem+json").send(problem)

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

export const registerEventStreamRoutes = (
  app: FastifyInstance,
  params: RegisterEventStreamRoutesParams,
) => {
  const resolveLoopback = params.isLoopbackRequest ?? isLoopbackRequest
  const timeoutMs = params.wsAuthFrameTimeoutMs ?? DEFAULT_WS_AUTH_FRAME_TIMEOUT_MS

  app.route({
    method: "GET",
    url: "/v1/events",
    preValidation: async (request, reply) => {
      const handshakeResult = validateEventStreamHandshake({
        query: request.query,
        eventJournal: params.eventJournal,
        workspaceRepository: params.workspaceRepository,
        sessionRepository: params.sessionRepository,
      })

      if (!handshakeResult.ok) {
        return sendProblem(reply, handshakeResult.status, handshakeResult.problem)
      }

      const sessionId = handshakeResult.handshake.filters.sessionId
      if (sessionId !== undefined) {
        await maybeAutoResumeSession({
          sessionId,
          sessionRepository: params.sessionRepository,
          sessionService: params.sessionService,
          workspaceRepository: params.workspaceRepository,
          acpSupervisor: params.acpSupervisor,
        })
      }

      eventStreamHandshakes.set(request, handshakeResult.handshake)
    },
    handler: (_request, reply) => {
      reply.code(426).send({ message: "Upgrade Required" })
    },
    wsHandler: (socket, request) => {
      const handshake = eventStreamHandshakes.get(request)
      if (handshake === undefined) {
        socket.close(1011, "handshake missing")
        return
      }

      void (async () => {
        const principal = await resolveStreamPrincipal({
          request,
          socket,
          deviceRepository: params.deviceRepository,
          isLoopback: resolveLoopback(request),
          timeoutMs,
        })

        if (principal === undefined || !authorizeActiveFullOperator(principal)) {
          if (socket.readyState === socket.OPEN || socket.readyState === socket.CONNECTING) {
            socket.close(1008, "unauthorized")
          }
          return
        }

        await runStreamConnection({
          socket,
          eventJournal: params.eventJournal,
          commitPublisher: params.commitPublisher,
          handshake,
          log: request.log,
        })
      })()
    },
  })
}
