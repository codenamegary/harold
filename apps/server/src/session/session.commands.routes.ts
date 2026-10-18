import { PromptSessionBodySchema } from "contracts/http/session"
import {
  ExtensionReplyBodySchema,
  PermissionReplyBodySchema,
  ReplyParamsSchema,
  SessionCommandParamsSchema,
  SessionCommandQuerySchema,
} from "contracts/http/session.stream"
import { FastifyInstance } from "fastify"
import { SessionCommandError, SessionHub } from "./hub/hub"
import {
  buildAuthRequiredProblem,
  buildExtensionConflictProblem,
  buildExtensionNotFoundProblem,
  buildPermissionConflictProblem,
  buildPermissionNotFoundProblem,
  buildSessionCommandRejectedProblem,
  buildSessionNotFoundProblem,
} from "./session.problems"

const sendProblem = (
  reply: {
    status: (code: number) => {
      type: (type: string) => { send: (body: unknown) => unknown }
    }
  },
  status: number,
  problem: unknown,
) => reply.status(status).type("application/problem+json").send(problem)

export type SessionCommandsRouteDeps = Readonly<{
  sessionHub: SessionHub
}>

export const registerSessionCommandsRoutes = (
  app: FastifyInstance,
  deps: SessionCommandsRouteDeps,
) => {
  const sendCommandError = (
    reply: Parameters<typeof sendProblem>[0],
    error: SessionCommandError,
  ) => {
    switch (error.kind) {
      case "unknown_session":
        return sendProblem(reply, 404, buildSessionNotFoundProblem(error.reason))
      case "auth_gated":
        return sendProblem(reply, 409, buildAuthRequiredProblem(error.reason))
      case "rejected":
        return sendProblem(reply, 422, buildSessionCommandRejectedProblem(error.reason))
    }
  }

  app.post("/v1/sessions/:sessionId/prompts", async (request, reply) => {
    const params = SessionCommandParamsSchema.parse(request.params)
    const query = SessionCommandQuerySchema.parse(request.query)
    const body = PromptSessionBodySchema.parse(request.body)

    const result = await deps.sessionHub.prompt({
      agentId: query.agentId,
      sessionId: params.sessionId,
      text: body.text,
      ...(body.attachments !== undefined && body.attachments.length > 0
        ? { attachments: body.attachments }
        : {}),
    })
    if (!result.ok) {
      return sendCommandError(reply, result.error)
    }

    return reply.status(202).send()
  })

  app.post("/v1/sessions/:sessionId/cancel", async (request, reply) => {
    const params = SessionCommandParamsSchema.parse(request.params)
    const query = SessionCommandQuerySchema.parse(request.query)

    const result = await deps.sessionHub.cancel({
      agentId: query.agentId,
      sessionId: params.sessionId,
    })
    if (!result.ok) {
      return sendCommandError(reply, result.error)
    }

    return reply.status(204).send()
  })

  app.post("/v1/permissions/:requestId/replies", async (request, reply) => {
    const params = ReplyParamsSchema.parse(request.params)
    const body = PermissionReplyBodySchema.parse(request.body)

    const outcome = deps.sessionHub.resolvePermissionReply({
      requestId: params.requestId,
      optionId: body.optionId,
    })
    if (outcome === "unknown") {
      return sendProblem(reply, 404, buildPermissionNotFoundProblem())
    }
    if (outcome === "already_settled") {
      return sendProblem(reply, 409, buildPermissionConflictProblem())
    }

    return reply.status(204).send()
  })

  app.post("/v1/extensions/:requestId/replies", async (request, reply) => {
    const params = ReplyParamsSchema.parse(request.params)
    const body = ExtensionReplyBodySchema.parse(request.body)

    const outcome = deps.sessionHub.resolveExtensionReply({
      requestId: params.requestId,
      result: body.result,
    })
    if (outcome === "unknown") {
      return sendProblem(reply, 404, buildExtensionNotFoundProblem())
    }
    if (outcome === "already_settled") {
      return sendProblem(reply, 409, buildExtensionConflictProblem())
    }

    return reply.status(204).send()
  })
}
