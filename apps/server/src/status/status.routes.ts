import { FastifyInstance } from "fastify"
import { AcpSupervisor } from "../acp/supervisor/supervisor.ports"
import { Config } from "../config/config"
import { Runtime } from "../runtime/runtime"
import { composeServerGetStatus } from "./status.adapters"

export const registerStatusRoutes = (
  app: FastifyInstance,
  runtime: Runtime,
  config: Config,
  acpSupervisor: AcpSupervisor,
) => {
  const getStatus = composeServerGetStatus({ app, runtime, config, acpSupervisor })

  app.get("/v1/status", async (_request, reply) => {
    return reply.status(200).send(getStatus())
  })
}
