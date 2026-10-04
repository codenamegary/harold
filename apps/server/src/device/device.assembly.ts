import { FastifyInstance } from "fastify"
import { CreatePairingCodeBody } from "contracts/http/pairing-code"
import { makeClaimPairingCode } from "core/device/claim.pairing.code.usecase"
import {
  CreatePairingCodeResult,
  makeCreatePairingCode,
} from "core/device/create.pairing.code.usecase"
import {
  CreateProbeDeviceResult,
  makeCreateProbeDevice,
} from "core/device/create.probe.device.usecase"
import {
  RevokeDeviceCommand,
  RevokeDeviceResult,
  makeRevokeDevice,
} from "core/device/revoke.device.usecase"
import {
  FindDeviceByCredentialHash,
  GetAdvertisedEndpointSettings,
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
  makeRevokeDeviceRow,
  makeTouchDeviceLastSeen,
} from "./device.sqlite.adapters"

export type AssembleDeviceSliceDeps = Readonly<{
  database: AgentDatabase
  loopbackEndpoint: string
  getAdvertisedEndpointSettings: GetAdvertisedEndpointSettings
}>

export type DeviceSlice = Readonly<{
  registerRoutes: (app: FastifyInstance) => void
  createPairingCode: (body?: CreatePairingCodeBody) => Promise<CreatePairingCodeResult>
  getPairingCodeById: GetPairingCodeById
  listDevices: ListDevices
  findDeviceByCredentialHash: FindDeviceByCredentialHash
  touchDeviceLastSeen: TouchDeviceLastSeen
  createProbeDevice: () => CreateProbeDeviceResult
  revokeDevice: (command: RevokeDeviceCommand) => RevokeDeviceResult
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
  const revokeDeviceRow = makeRevokeDeviceRow(deps.database)
  const listDevices = makeListDevices(deps.database)

  const createPairingCode = makeCreatePairingCode({
    loopbackEndpoint: deps.loopbackEndpoint,
    getAdvertisedEndpointSettings: deps.getAdvertisedEndpointSettings,
    insertPairingCode,
  })
  const claimPairingCode = makeClaimPairingCode({
    markExpiredActiveBefore,
    listActivePairingCodes,
    listPairingCodesByStates,
    markPairingCodeExpired,
    getPairingCodeById,
    claimPairingCodeRow,
  })
  const createProbeDevice = makeCreateProbeDevice({ insertProbeDevice })
  const revokeDevice = makeRevokeDevice({
    revokeDeviceRow,
    closeDeviceConnections,
  })

  return {
    registerRoutes: (app) => {
      registerDeviceRoutes(app, {
        createPairingCode,
        claimPairingCode,
        listDevices,
        revokeDevice,
      })
    },
    createPairingCode,
    getPairingCodeById,
    listDevices,
    findDeviceByCredentialHash,
    touchDeviceLastSeen,
    createProbeDevice,
    revokeDevice,
  }
}
