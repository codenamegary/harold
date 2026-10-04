import {
  ClaimPairingCodeBodySchema,
  CreatePairingCodeBodySchema,
  CreatePairingCodeResponseSchema,
  ClaimPairingCodeResponseSchema,
  PAIRING_CODES_PATH,
  claimPairingCodePath,
} from "contracts/http/pairing-code"
import {
  DeleteDeviceQuerySchema,
  DeviceCollectionSchema,
  DEVICES_PATH,
  devicePath,
  ListDevicesQuerySchema,
} from "contracts/http/device"
import { FastifyInstance } from "fastify"
import {
  buildAdvertisedEndpointUnavailableProblem,
  buildDeviceNotFoundProblem,
  buildInvalidCursorProblem,
  buildPairingCodeClaimedProblem,
  buildPairingCodeExpiredProblem,
  buildPairingCodeNotFoundProblem,
  buildPairingCodeRevokedProblem,
} from "./device.problems"
import { DeviceError } from "core/device/errors"
import {
  ClaimPairingCodeCommand,
  ClaimPairingCodeResult,
} from "core/device/claim.pairing.code.usecase"
import { ListDevices } from "core/device/ports"
import { CreatePairingCodeResult } from "core/device/create.pairing.code.usecase"
import { RevokeDeviceCommand, RevokeDeviceResult } from "core/device/revoke.device.usecase"

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
    case "device_not_found":
      return { status: 404, problem: buildDeviceNotFoundProblem() }
    case "pairing_code_claimed":
    case "pairing_code_race":
      return { status: 409, problem: buildPairingCodeClaimedProblem() }
    case "pairing_code_expired":
      return { status: 409, problem: buildPairingCodeExpiredProblem() }
    case "pairing_code_revoked":
      return { status: 409, problem: buildPairingCodeRevokedProblem() }
    case "advertised_endpoint_unavailable":
      return { status: 400, problem: buildAdvertisedEndpointUnavailableProblem() }
  }
}

const isDeviceError = (error: { kind: string }): error is DeviceError => {
  switch (error.kind) {
    case "pairing_code_not_found":
    case "device_not_found":
    case "pairing_code_claimed":
    case "pairing_code_race":
    case "pairing_code_expired":
    case "pairing_code_revoked":
    case "advertised_endpoint_unavailable":
      return true
    default:
      return false
  }
}

const sendErrorProblem = (reply: Parameters<typeof sendProblem>[0], error: { kind: string }) => {
  if (isDeviceError(error)) {
    const mapped = problemForError(error)
    return sendProblem(reply, mapped.status, mapped.problem)
  }
  return sendProblem(reply, 500, { title: "Internal error", status: 500 })
}

export type DeviceRouteDeps = Readonly<{
  createPairingCode: (body?: {
    endpoint?: "loopback" | "advertised"
  }) => Promise<CreatePairingCodeResult>
  claimPairingCode: (command: ClaimPairingCodeCommand) => Promise<ClaimPairingCodeResult>
  listDevices: ListDevices
  revokeDevice: (command: RevokeDeviceCommand) => RevokeDeviceResult
}>

export const registerDeviceRoutes = (app: FastifyInstance, deps: DeviceRouteDeps) => {
  app.post(PAIRING_CODES_PATH, async (request, reply) => {
    const body = CreatePairingCodeBodySchema.parse(request.body ?? {})
    const result = await deps.createPairingCode(body)

    if (!result.ok) {
      return sendErrorProblem(reply, result.error)
    }

    return reply.status(201).send(CreatePairingCodeResponseSchema.parse(result.value))
  })

  app.post(claimPairingCodePath(":code"), async (request, reply) => {
    const { code } = request.params as { code: string }
    const body = ClaimPairingCodeBodySchema.parse(request.body ?? {})
    const result = await deps.claimPairingCode({ code, body })

    if (!result.ok) {
      return sendErrorProblem(reply, result.error)
    }

    return reply.status(201).send(ClaimPairingCodeResponseSchema.parse(result.value))
  })

  app.get(DEVICES_PATH, async (request, reply) => {
    const query = ListDevicesQuerySchema.parse(request.query)
    const result = deps.listDevices(query)

    if (!result.ok) {
      return sendProblem(reply, 400, buildInvalidCursorProblem())
    }

    return reply.status(200).send(
      DeviceCollectionSchema.parse({
        items: result.value.items,
        page: {
          limit: result.value.limit,
          nextCursor: result.value.nextCursor,
          previousCursor: result.value.previousCursor,
          count: result.value.count,
        },
      }),
    )
  })

  app.delete(devicePath(":deviceId"), async (request, reply) => {
    const { deviceId } = request.params as { deviceId: string }
    const query = DeleteDeviceQuerySchema.parse(request.query)
    const result = deps.revokeDevice({ deviceId, hardDelete: query.hardDelete })

    if (!result.ok) {
      return sendErrorProblem(reply, result.error)
    }

    return reply.status(204).send()
  })
}
