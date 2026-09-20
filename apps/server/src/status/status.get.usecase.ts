import { Status, StatusSchema } from "contracts/http/status"
import {
  GetAcpStatus,
  GetBindPort,
  GetServerStartedAt,
  GetServerState,
  GetServerVersion,
} from "./status.ports"

export type GetStatusDeps = Readonly<{
  getVersion: GetServerVersion
  getServerState: GetServerState
  getStartedAt: GetServerStartedAt
  getBindPort: GetBindPort
  getAcpStatus: GetAcpStatus
}>

export type GetStatus = () => Status

export const makeGetStatus =
  (deps: GetStatusDeps): GetStatus =>
  () =>
    StatusSchema.parse({
      version: deps.getVersion(),
      state: deps.getServerState(),
      bindAddress: "127.0.0.1",
      port: deps.getBindPort(),
      startedAt: deps.getStartedAt(),
      acp: deps.getAcpStatus(),
    })
