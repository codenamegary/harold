import { HaroldState } from "contracts/http/status"
import { BindHost } from "contracts/http/runtime-settings"
import { AcpStatus } from "./status.models"

export type GetServerVersion = () => string

export type GetServerState = () => HaroldState

export type GetServerStartedAt = () => string

export type GetBindAddress = () => BindHost

export type GetBindPort = () => number

export type GetAcpStatus = () => AcpStatus
