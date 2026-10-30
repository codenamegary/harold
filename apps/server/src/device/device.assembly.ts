import { FastifyInstance } from "fastify"
import {
  ClaimPairingCodeCommand,
  ClaimPairingCodeResult,
  makeClaimPairingCode,
} from "core/device/claim.pairing.code.usecase"
import {
  CreatePairingCodeResult,
  makeCreatePairingCode,
} from "core/device/create.pairing.code.usecase"
import {
  CreateProbeDeviceResult,
  makeCreateProbeDevice,
} from "core/device/create.probe.device.usecase"
import {
  RemoveDeviceCommand,
  RemoveDeviceResult,
  makeRemoveDevice,
} from "core/device/remove.device.usecase"
import {
  FindDeviceByCredentialHash,
  GetPairingCodeById,
  ListDevices,
  TouchDeviceLastSeen,
} from "core/device/ports"
import { AgentDatabase } from "../persistence/database"
import { registerDeviceRoutes } from "./device.routes"
import { closeDeviceConnections } from "./device.presence"
import {
  makeClaimPairingCodeRow,
  makeFindDeviceByCredentialHash,
  makeGetPairingCodeById,
  makeInsertPairingCode,
  makeInsertProbeDevice,
  makeListActivePairingCodes,
  makeListDevices,
  makeListPairingCodesByStates,
  makeMarkExpiredActiveBefore,
  makeMarkPairingCodeExpired,
  makeRemoveDeviceRow,
  makeTouchDeviceLastSeen,
} from "./device.sqlite.adapters"

export type AssembleDeviceSliceDeps = Readonly<{
  database: AgentDatabase
}>

export type DeviceSlice = Readonly<{
  registerRoutes: (app: FastifyInstance) => void
  createPairingCode: (endpoint: string) => Promise<CreatePairingCodeResult>
  claimPairingCode: (command: ClaimPairingCodeCommand) => Promise<ClaimPairingCodeResult>
  getPairingCodeById: GetPairingCodeById
  listDevices: ListDevices
  findDeviceByCredentialHash: FindDeviceByCredentialHash
  touchDeviceLastSeen: TouchDeviceLastSeen
  createProbeDevice: () => CreateProbeDeviceResult
  removeDevice: (command: RemoveDeviceCommand) => RemoveDeviceResult
}>

export const assembleDeviceSlice = (deps: AssembleDeviceSliceDeps): DeviceSlice => {
  const insertPairingCode = makeInsertPairingCode(deps.database)
  const listActivePairingCodes = makeListActivePairingCodes(deps.database)
  const listPairingCodesByStates = makeListPairingCodesByStates(deps.database)
  const markExpiredActiveBefore = makeMarkExpiredActiveBefore(deps.database)
  const markPairingCodeExpired = makeMarkPairingCodeExpired(deps.database)
  const getPairingCodeById = makeGetPairingCodeById(deps.database)
  const claimPairingCodeRow = makeClaimPairingCodeRow(deps.database)
  const insertProbeDevice = makeInsertProbeDevice(deps.database)
  const findDeviceByCredentialHash = makeFindDeviceByCredentialHash(deps.database)
  const touchDeviceLastSeen = makeTouchDeviceLastSeen(deps.database)
  const removeDeviceRow = makeRemoveDeviceRow(deps.database)
  const listDevices = makeListDevices(deps.database)

  const createPairingCode = makeCreatePairingCode({ insertPairingCode })
  const claimPairingCode = makeClaimPairingCode({
    markExpiredActiveBefore,
    listActivePairingCodes,
    listPairingCodesByStates,
    markPairingCodeExpired,
    getPairingCodeById,
    claimPairingCodeRow,
  })
  const createProbeDevice = makeCreateProbeDevice({ insertProbeDevice })
  const removeDevice = makeRemoveDevice({
    removeDeviceRow,
    closeDeviceConnections,
  })

  return {
    registerRoutes: (app) => {
      registerDeviceRoutes(app, {
        claimPairingCode,
        removeDevice,
      })
    },
    createPairingCode,
    claimPairingCode,
    getPairingCodeById,
    listDevices,
    findDeviceByCredentialHash,
    touchDeviceLastSeen,
    createProbeDevice,
    removeDevice,
  }
}
