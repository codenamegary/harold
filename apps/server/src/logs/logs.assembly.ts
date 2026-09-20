import { FastifyInstance } from "fastify"
import { Writable } from "node:stream"
import { SpawnAgentProcessFn } from "../acp/supervisor/supervisor.ports"
import { makeInMemoryLogStore } from "./logs.buffer.adapters"
import { makeQueryLogs } from "./logs.query.usecase"
import { registerLogRoutes } from "./logs.routes"
import { createLoggedAgentSpawn, createLogSinkStream } from "./logs.stream.adapters"

export type AssembleLogsSliceDeps = Readonly<{
  /** Receives every raw log chunk after it is buffered, e.g. stdout. */
  downstream?: Writable
  spawnAgentProcess: SpawnAgentProcessFn
}>

export type LogsSlice = Readonly<{
  registerRoutes: (app: FastifyInstance) => void
  logSink: Writable
  spawnAgentProcessFn: SpawnAgentProcessFn
}>

export const assembleLogsSlice = (deps: AssembleLogsSliceDeps): LogsSlice => {
  const store = makeInMemoryLogStore()
  const queryLogs = makeQueryLogs({ getLogRecords: store.getLogRecords })

  return {
    registerRoutes: (app) => {
      registerLogRoutes(app, { queryLogs, clearLogs: store.clearLogs })
    },
    logSink: createLogSinkStream({
      appendLog: store.appendLog,
      downstream: deps.downstream,
    }),
    spawnAgentProcessFn: createLoggedAgentSpawn({
      appendLog: store.appendLog,
      spawnAgentProcess: deps.spawnAgentProcess,
    }),
  }
}
