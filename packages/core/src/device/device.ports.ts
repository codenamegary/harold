import { Device, ListDevicesQuery } from "contracts/http/device"
import { PairingCodeState } from "contracts/http/pairing-code"
import { DeviceError } from "./device.errors"

export type PairingCodeSnapshot = Readonly<{
  id: string
  codeHash: string
  state: PairingCodeState
  expiresAt: string
}>

export type AdvertisedEndpointSettings = Readonly<{
  advertisedUrl: string | null
  advertisedUrlEnabled: boolean
}>

export type GetAdvertisedEndpointSettings = () => AdvertisedEndpointSettings

export type InsertedPairingCode = Readonly<{
  id: string
  createdAt: string
  expiresAt: string
  state: "active"
}>

export type InsertPairingCodeInput = Readonly<{
  codeHash: string
  createdAt: string
  expiresAt: string
}>

export type InsertPairingCode = (
  input: InsertPairingCodeInput,
) => { ok: true; value: InsertedPairingCode } | { ok: false; error: DeviceError }

export type ListActivePairingCodes = () => ReadonlyArray<PairingCodeSnapshot>

export type ListPairingCodesByStates = (
  states: ReadonlyArray<PairingCodeState>,
) => ReadonlyArray<PairingCodeSnapshot>

export type MarkExpiredActiveBefore = (input: { nowIso: string }) => void

export type MarkPairingCodeExpired = (input: { id: string }) => void

export type GetPairingCodeById = (id: string) => PairingCodeSnapshot | undefined

export type ClaimPairingCodeRowInput = Readonly<{
  pairingCodeId: string
  name: string
  platform: string | null
  credentialHash: string
  pairedAt: string
}>

export type ClaimPairingCodeRow = (
  input: ClaimPairingCodeRowInput,
) => { ok: true; value: Device } | { ok: false; error: DeviceError }

export type InsertProbeDeviceInput = Readonly<{
  name: string
  platform: string | null
  credentialHash: string
  pairedAt: string
}>

export type InsertProbeDevice = (
  input: InsertProbeDeviceInput,
) => { ok: true; value: Device } | { ok: false; error: DeviceError }

export type DeviceCredentialLookup = Readonly<{
  id: string
  revokedAt: string | null
}>

export type FindDeviceByCredentialHash = (
  credentialHash: string,
) => DeviceCredentialLookup | undefined

export type TouchDeviceLastSeen = (input: { deviceId: string; lastSeenAt: string }) => void

export type RevokeDeviceRowInput = Readonly<{
  deviceId: string
  revokedAt: string
  hardDelete: boolean
}>

export type RevokeDeviceRowResult =
  | { ok: true; value: { newlyRevoked: boolean } }
  | { ok: false; error: DeviceError }

export type RevokeDeviceRow = (input: RevokeDeviceRowInput) => RevokeDeviceRowResult

export type DeviceListPage = Readonly<{
  items: Device[]
  limit: number
  nextCursor?: string
  previousCursor?: string
  count: number
}>

export type DeviceListResult =
  | { ok: true; value: DeviceListPage }
  | { ok: false; error: { kind: "invalid_cursor" } }

export type ListDevices = (query: ListDevicesQuery) => DeviceListResult

export type CloseDeviceConnections = (deviceId: string) => void
