import {
  ClaimPairingCodeBodySchema,
  ClaimPairingCodeResponseSchema,
  claimPairingCodePath,
} from "contracts/http/pairing-code"
import { devicePath } from "contracts/http/device"
import { FastifyInstance } from "fastify"
import {
  buildDeviceForbiddenProblem,
  buildDeviceNotFoundProblem,
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
import { RemoveDeviceCommand, RemoveDeviceResult } from "core/device/remove.device.usecase"
import { getRequestPrincipal } from "../auth/middleware"

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
  claimPairingCode: (command: ClaimPairingCodeCommand) => Promise<ClaimPairingCodeResult>
  removeDevice: (command: RemoveDeviceCommand) => RemoveDeviceResult
}>

// Device plane only: a device claims a pairing code and removes itself.
// Creating pairing codes and listing or removing other devices are host
// operations owned by the CLI against the same database (#458).
export const registerDeviceRoutes = (app: FastifyInstance, deps: DeviceRouteDeps) => {
  app.post(claimPairingCodePath(":code"), async (request, reply) => {
    const { code } = request.params as { code: string }
    const body = ClaimPairingCodeBodySchema.parse(request.body ?? {})
    const result = await deps.claimPairingCode({ code, body })

    if (!result.ok) {
      return sendErrorProblem(reply, result.error)
    }

    return reply.status(201).send(ClaimPairingCodeResponseSchema.parse(result.value))
  })

  app.delete(devicePath(":deviceId"), async (request, reply) => {
    const { deviceId } = request.params as { deviceId: string }
    const principal = getRequestPrincipal(request)
    if (principal?.kind !== "device" || principal.deviceId !== deviceId) {
      return sendProblem(reply, 403, buildDeviceForbiddenProblem())
    }

    const result = deps.removeDevice({ deviceId })

    if (!result.ok) {
      return sendErrorProblem(reply, result.error)
    }

    return reply.status(204).send()
  })
}
