import { FastifyInstance } from "fastify"
import { Config } from "../config/config"
import { Runtime } from "../runtime/runtime"
import { AcpSupervisor } from "../acp/supervisor/supervisor.ports"
import { makeGetStatus } from "./status.get.usecase"

export const registerStatusRoutes = (
  app: FastifyInstance,
  runtime: Runtime,
  config: Config,
  acpSupervisor: AcpSupervisor,
) => {
  const getStatus = makeGetStatus({
    getVersion: () => runtime.version,
    getServerState: () => runtime.getState(),
    getStartedAt: () => runtime.startedAt,
    getBindPort: () => {
      const address = app.server.address()
      return typeof address === "object" && address !== null ? address.port : config.port
    },
    getAcpStatus: () => acpSupervisor.getStatus(),
  })

  app.get("/v1/status", async (_request, reply) => {
    return reply.status(200).send(getStatus())
  })
}
