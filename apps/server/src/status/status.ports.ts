import { HaroldState } from "contracts/http/status"
import { AcpSupervisorStatus } from "../acp/supervisor/models"

export type GetServerVersion = () => string

export type GetServerState = () => HaroldState

export type GetServerStartedAt = () => string

export type GetBindPort = () => number

export type GetAcpStatus = () => AcpSupervisorStatus
