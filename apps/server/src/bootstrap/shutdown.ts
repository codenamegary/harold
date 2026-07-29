import { FastifyInstance } from "fastify"
import { Config } from "../config/config"
import { AgentDatabase } from "../persistence/open-database"
import { RuntimeStatusService } from "../runtime/status.service"
import { AcpSupervisor } from "../acp/supervisor/acp-supervisor-types"

export const listen = async (
  app: FastifyInstance,
  config: Config,
  runtimeStatusService: RuntimeStatusService,
) => {
  await app.listen({ host: config.host, port: config.port })
  runtimeStatusService.persistOnline()
}

export const registerShutdown = (
  app: FastifyInstance,
  database: AgentDatabase,
  acpSupervisor: AcpSupervisor,
  runtimeStatusService: RuntimeStatusService,
  signals: ReadonlyArray<NodeJS.Signals> = ["SIGINT", "SIGTERM"],
) => {
  const shutdown = async (signal: NodeJS.Signals) => {
    app.log.info({ signal }, "shutting down")
    runtimeStatusService.persistShuttingDown()
    await acpSupervisor.stop()
    await app.close()
    runtimeStatusService.persistOffline()
    database.close()
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
