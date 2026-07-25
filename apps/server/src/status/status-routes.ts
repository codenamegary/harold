import { StatusSchema } from "contracts/http/status"
import { FastifyInstance } from "fastify"
import { Config } from "../config/config"
import { Runtime } from "../runtime/runtime"

const resolvePort = (app: FastifyInstance, config: Config): number => {
  const address = app.server.address()
  return typeof address === "object" && address !== null
    ? address.port
    : config.port
}

export const registerStatusRoutes = (
  app: FastifyInstance,
  runtime: Runtime,
  config: Config,
) => {
  app.get("/v1/status", async (_request, reply) => {
    const status = StatusSchema.parse({
      version: runtime.version,
      state: runtime.getState(),
      bindAddress: "127.0.0.1",
      port: resolvePort(app, config),
      startedAt: runtime.startedAt,
      uptimeSeconds: runtime.uptimeSeconds(),
      acp: {
        state: "stopped",
        activeSessions: 0,
      },
    })

    return reply.status(200).send(status)
  })
}
