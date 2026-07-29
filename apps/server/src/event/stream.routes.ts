import { FastifyInstance, FastifyRequest } from "fastify"
import { WebSocket } from "ws"
import { SessionRepository } from "../session/repository"
import { WorkspaceRepository } from "../workspace/repository"
import { EventJournalRepository } from "./journal.repository"
import {
  validateEventStreamHandshake,
  ValidatedEventStreamHandshake,
} from "./stream.handshake"
import { replayJournalEvents } from "./stream.replay"

const eventStreamHandshakes = new WeakMap<object, ValidatedEventStreamHandshake>()

type RegisterEventStreamRoutesParams = {
  eventJournal: EventJournalRepository
  workspaceRepository: WorkspaceRepository
  sessionRepository: SessionRepository
}

const sendProblem = (
  reply: {
    status: (code: number) => { type: (type: string) => { send: (body: unknown) => unknown } }
  },
  status: number,
  problem: unknown,
) => reply.status(status).type("application/problem+json").send(problem)

const runReplay = async (
  socket: WebSocket,
  request: FastifyRequest,
  eventJournal: EventJournalRepository,
  handshake: Extract<ValidatedEventStreamHandshake, { mode: "replay" }>,
): Promise<void> => {
  await replayJournalEvents({
    socket,
    eventJournal,
    requestedCursor: handshake.replayCursor,
    filters: handshake.filters,
    log: request.log,
  })
}

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

      if (handshake.mode === "live-only") {
        return
      }

      void runReplay(socket, request, params.eventJournal, handshake)
    },
  })
}
