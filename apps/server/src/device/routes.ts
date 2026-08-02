import {
  ClaimPairingCodeBodySchema,
  CreatePairingCodeBodySchema,
  CreatePairingCodeResponseSchema,
  ClaimPairingCodeResponseSchema,
  PAIRING_CODES_PATH,
  claimPairingCodePath,
} from "contracts/http/pairing-code"
import { FastifyInstance } from "fastify"
import { DeviceService } from "./service"
import {
  buildPairingCodeClaimedProblem,
  buildPairingCodeExpiredProblem,
  buildPairingCodeNotFoundProblem,
  buildPairingCodeRevokedProblem,
} from "./problems"
import { DeviceError } from "./errors"

const sendProblem = (
  reply: {
    status: (code: number) => {
      type: (type: string) => { send: (body: unknown) => unknown }
    }
  },
  status: number,
  problem: unknown,
) => reply.status(status).type("application/problem+json").send(problem)

const problemForError = (error: DeviceError) => {
  switch (error.kind) {
    case "pairing_code_not_found":
      return { status: 404, problem: buildPairingCodeNotFoundProblem() }
    case "pairing_code_claimed":
    case "pairing_code_race":
      return { status: 409, problem: buildPairingCodeClaimedProblem() }
    case "pairing_code_expired":
      return { status: 409, problem: buildPairingCodeExpiredProblem() }
    case "pairing_code_revoked":
      return { status: 409, problem: buildPairingCodeRevokedProblem() }
  }
}

export const registerDeviceRoutes = (app: FastifyInstance, service: DeviceService) => {
  app.post(PAIRING_CODES_PATH, async (request, reply) => {
    CreatePairingCodeBodySchema.parse(request.body ?? {})
    const result = await service.createPairingCode()

    if (!result.ok) {
      const mapped = problemForError(result.error)
      return sendProblem(reply, mapped.status, mapped.problem)
    }

    return reply
      .status(201)
      .send(CreatePairingCodeResponseSchema.parse(result.value))
  })

  app.post(claimPairingCodePath(":code"), async (request, reply) => {
    const { code } = request.params as { code: string }
    const body = ClaimPairingCodeBodySchema.parse(request.body ?? {})
    const result = await service.claimPairingCode({ code, body })

    if (!result.ok) {
      const mapped = problemForError(result.error)
      return sendProblem(reply, mapped.status, mapped.problem)
    }

    return reply
      .status(201)
      .send(ClaimPairingCodeResponseSchema.parse(result.value))
  })
}
