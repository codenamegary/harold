import {
  ClaimPairingCodeBodySchema,
  CreatePairingCodeBodySchema,
  CreatePairingCodeResponseSchema,
  ClaimPairingCodeResponseSchema,
  PAIRING_CODES_PATH,
  claimPairingCodePath,
} from "contracts/http/pairing-code"
import {
  DeviceCollectionSchema,
  DEVICES_PATH,
  ListDevicesQuerySchema,
} from "contracts/http/device"
import { FastifyInstance } from "fastify"
import { DeviceService } from "./service"
import {
  buildInvalidCursorProblem,
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

const isDeviceError = (error: { kind: string }): error is DeviceError => {
  switch (error.kind) {
    case "pairing_code_not_found":
    case "pairing_code_claimed":
    case "pairing_code_race":
    case "pairing_code_expired":
    case "pairing_code_revoked":
      return true
    default:
      return false
  }
}

export const registerDeviceRoutes = (app: FastifyInstance, service: DeviceService) => {
  app.post(PAIRING_CODES_PATH, async (request, reply) => {
    CreatePairingCodeBodySchema.parse(request.body ?? {})
    const result = await service.createPairingCode()

    if (!result.ok) {
      if (isDeviceError(result.error)) {
        const mapped = problemForError(result.error)
        return sendProblem(reply, mapped.status, mapped.problem)
      }
      return sendProblem(reply, 500, { title: "Internal error", status: 500 })
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
      if (isDeviceError(result.error)) {
        const mapped = problemForError(result.error)
        return sendProblem(reply, mapped.status, mapped.problem)
      }
      return sendProblem(reply, 500, { title: "Internal error", status: 500 })
    }

    return reply
      .status(201)
      .send(ClaimPairingCodeResponseSchema.parse(result.value))
  })

  app.get(DEVICES_PATH, async (request, reply) => {
    const query = ListDevicesQuerySchema.parse(request.query)
    const result = service.list(query)

    if (!result.ok) {
      if (result.error.kind === "invalid_cursor") {
        return sendProblem(reply, 400, buildInvalidCursorProblem())
      }
      return sendProblem(reply, 500, { title: "Internal error", status: 500 })
    }

    return reply.status(200).send(DeviceCollectionSchema.parse(result.value))
  })
}
