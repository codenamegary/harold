import { FastifyInstance } from "fastify"
import { Config } from "../config/config"
import { AgentDatabase } from "../persistence/open-database"
import { Runtime } from "../runtime/runtime"
import { AcpSupervisor } from "../acp/acp-supervisor-types"

export const listen = async (
  app: FastifyInstance,
  config: Config,
  runtime: Runtime,
) => {
  runtime.setState("starting")
  await app.listen({ host: config.host, port: config.port })
  runtime.setState("online")
}

export const registerShutdown = (
  app: FastifyInstance,
  runtime: Runtime,
  database: AgentDatabase,
  acpSupervisor: AcpSupervisor,
  signals: ReadonlyArray<NodeJS.Signals> = ["SIGINT", "SIGTERM"],
) => {
  const shutdown = async (signal: NodeJS.Signals) => {
    app.log.info({ signal }, "shutting down")
    runtime.setState("shutting_down")
    await acpSupervisor.stop()
    await app.close()
    database.close()
    runtime.setState("offline")
    process.exit(0)
  }

  signals.forEach((signal) => {
    process.once(signal, () => {
      shutdown(signal).catch((error: unknown) => {
        app.log.error({ err: error }, "shutdown failed")
        process.exit(1)
      })
    })
  })
}
