import { ConnectionCheckResult } from "contracts/http/connection-test"
import { CreateProbeDeviceResult } from "../device/device.create.probe.device.usecase"
import { RevokeDeviceCommand, RevokeDeviceResult } from "../device/device.revoke.device.usecase"

export type LookupAddress = Readonly<{ address: string; family: number }>

export type LookupHost = (
  hostname: string,
  options: { all: true },
) => Promise<ReadonlyArray<LookupAddress>>

export type ConnectTcp = (params: { host: string; port: number }) => Promise<void>

export type VerifyTls = (params: {
  hostname: string
  port: number
  allowSelfSigned: boolean
}) => Promise<ConnectionCheckResult>

export type FetchDeviceAuth = (params: {
  url: string
  credential: string
  allowSelfSignedTls: boolean
}) => Promise<ConnectionCheckResult>

export type GetAdvertisedUrl = () => string | null

export type CreateProbeDevice = () => CreateProbeDeviceResult

export type RevokeDevice = (command: RevokeDeviceCommand) => RevokeDeviceResult

export type DeviceProvisioningPort = Readonly<{
  createProbeDevice: CreateProbeDevice
  revokeDevice: RevokeDevice
}>
