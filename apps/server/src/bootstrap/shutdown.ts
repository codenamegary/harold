import { FastifyInstance } from "fastify"
import { Config } from "../config/config"
import { AgentDatabase } from "../persistence/database"
import { RuntimeStatusService } from "../runtime/status.service"
import { AcpSupervisor } from "../acp/supervisor/supervisor.ports"
import { DaemonStateWriter } from "../status/daemon.state.writer"

export const listen = async (
  app: FastifyInstance,
  config: Config,
  runtimeStatusService: RuntimeStatusService,
) => {
  await app.listen({ host: config.host, port: config.port })
  runtimeStatusService.persistOnline()
}

type RunShutdownParams = {
  app: FastifyInstance
  database: AgentDatabase
  acpSupervisor: AcpSupervisor
  runtimeStatusService: RuntimeStatusService
  daemonStateWriter?: DaemonStateWriter
  signal?: NodeJS.Signals
  exit?: (code: number) => never
}

export const runShutdown = async (params: RunShutdownParams): Promise<void> => {
  params.app.log.info({ signal: params.signal }, "shutting down")
  params.daemonStateWriter?.stop()
  params.runtimeStatusService.persistShuttingDown()
  await params.acpSupervisor.stop()
  await params.app.close()
  params.runtimeStatusService.persistOffline()
  params.database.close()
  const exit = params.exit ?? ((code: number) => process.exit(code))
  exit(0)
}

type RegisterShutdownOptions = {
  signals?: ReadonlyArray<NodeJS.Signals>
  daemonStateWriter?: DaemonStateWriter
}

export const registerShutdown = (
  app: FastifyInstance,
  database: AgentDatabase,
  acpSupervisor: AcpSupervisor,
  runtimeStatusService: RuntimeStatusService,
  options: RegisterShutdownOptions = {},
) => {
  const shutdown = async (signal: NodeJS.Signals) => {
    await runShutdown({
      app,
      database,
      acpSupervisor,
      runtimeStatusService,
      daemonStateWriter: options.daemonStateWriter,
      signal,
    })
  }

  const signals = options.signals ?? ["SIGINT", "SIGTERM"]

  signals.forEach((signal) => {
    process.once(signal, () => {
      shutdown(signal).catch((error: unknown) => {
        app.log.error({ err: error }, "shutdown failed")
        process.exit(1)
      })
    })
  })
}
