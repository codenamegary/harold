import { FastifyInstance } from "fastify"
import { Config } from "../config/config"
import { closeAllStreamConnections } from "../event/stream.connections"
import { AgentDatabase } from "../persistence/database"
import { RuntimeStatusService } from "../runtime/status.service"
import { AcpSupervisor } from "../acp/supervisor/acp-supervisor-types"
import { SessionService } from "../session/service"

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
  sessionService: SessionService
  disposeOfflineOnBindingClear?: () => void
  signal?: NodeJS.Signals
  exit?: (code: number) => never
}

export const runShutdown = async (params: RunShutdownParams): Promise<void> => {
  params.app.log.info({ signal: params.signal }, "shutting down")
  params.runtimeStatusService.persistShuttingDown()
  closeAllStreamConnections()
  const marked = params.sessionService.markLiveSessionsOffline()
  if (!marked.ok) {
    throw new Error("failed to mark live sessions offline on shutdown")
  }
  await params.acpSupervisor.stop()
  params.disposeOfflineOnBindingClear?.()
  await params.app.close()
  params.runtimeStatusService.persistOffline()
  params.database.close()
  const exit = params.exit ?? ((code: number) => process.exit(code))
  exit(0)
}

export const registerShutdown = (
  app: FastifyInstance,
  database: AgentDatabase,
  acpSupervisor: AcpSupervisor,
  runtimeStatusService: RuntimeStatusService,
  sessionService: SessionService,
  disposeOfflineOnBindingClear?: () => void,
  signals: ReadonlyArray<NodeJS.Signals> = ["SIGINT", "SIGTERM"],
) => {
  const shutdown = async (signal: NodeJS.Signals) => {
    await runShutdown({
      app,
      database,
      acpSupervisor,
      runtimeStatusService,
      sessionService,
      disposeOfflineOnBindingClear,
      signal,
    })
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
