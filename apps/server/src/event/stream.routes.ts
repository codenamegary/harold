import { FastifyInstance } from "fastify"
import { SessionRepository } from "../session/repository"
import { SessionService } from "../session/service"
import { WorkspaceRepository } from "../workspace/repository"
import { AcpSupervisor } from "../acp/supervisor/acp-supervisor-types"
import { maybeAutoResumeSession } from "../session/resume.session"
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
}

const sendProblem = (
  reply: {
    status: (code: number) => { type: (type: string) => { send: (body: unknown) => unknown } }
  },
  status: number,
  problem: unknown,
) => reply.status(status).type("application/problem+json").send(problem)

export const registerEventStreamRoutes = (
  app: FastifyInstance,
  params: RegisterEventStreamRoutesParams,
) => {
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

      void runStreamConnection({
        socket,
        eventJournal: params.eventJournal,
        commitPublisher: params.commitPublisher,
        handshake,
        log: request.log,
      })
    },
  })
}
