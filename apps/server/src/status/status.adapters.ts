import { FastifyInstance } from "fastify"
import { makeGetStatus } from "core/status/get.usecase"
import { AcpSupervisor } from "../acp/supervisor/supervisor.ports"
import { Config } from "../config/config"
import { Runtime } from "../runtime/runtime"

export type ComposeServerStatusDeps = Readonly<{
  app: FastifyInstance
  runtime: Runtime
  config: Config
  acpSupervisor: AcpSupervisor
}>

/**
 * Adapts server runtime objects (Runtime, Config, bound Fastify app, ACP
 * supervisor) into the status ports core's `makeGetStatus` requires.
 */
export const composeServerGetStatus = (deps: ComposeServerStatusDeps) =>
  makeGetStatus({
    getVersion: () => deps.runtime.version,
    getServerState: () => deps.runtime.getState(),
    getStartedAt: () => deps.runtime.startedAt,
    getBindPort: () => {
      const address = deps.app.server.address()
      return typeof address === "object" && address !== null ? address.port : deps.config.port
    },
    getAcpStatus: () => deps.acpSupervisor.getStatus(),
  })
