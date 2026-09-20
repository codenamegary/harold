import { Writable } from "node:stream"
import {
  SpawnAgentProcessFn,
  SpawnAgentProcessParams,
  SpawnedAgentProcess,
} from "../acp/supervisor/spawn.agent.process"
import { AppendLog } from "./logs.ports"
import { parsePinoLine } from "./logs.pino.line"

export type CreateLogSinkStreamParams = Readonly<{
  appendLog: AppendLog
  downstream?: Writable
}>

export const createLogSinkStream = (params: CreateLogSinkStreamParams): Writable => {
  const leftover = { value: "" }
  const { appendLog, downstream } = params

  return new Writable({
    write(chunk, _encoding, callback) {
      const text = typeof chunk === "string" ? chunk : Buffer.from(chunk).toString("utf8")
      leftover.value += text
      const pieces = leftover.value.split("\n")
      leftover.value = pieces.pop() ?? ""
      pieces.forEach((line) => {
        const record = parsePinoLine(line)
        if (record !== null) {
          appendLog(record)
        }
      })

      if (downstream === undefined) {
        callback()
        return
      }

      const canContinue = downstream.write(chunk)
      if (canContinue) {
        callback()
        return
      }
      downstream.once("drain", callback)
    },
  })
}

/**
 * The spawn function injected by the composition root. Wider than
 * `SpawnAgentProcessFn`: this slice owns the stderr tap, so the port
 * must accept `onStderrLine`.
 */
export type SpawnAgentProcess = (input: SpawnAgentProcessParams) => SpawnedAgentProcess

export type CreateLoggedAgentSpawnParams = Readonly<{
  appendLog: AppendLog
  spawnAgentProcess: SpawnAgentProcess
}>

export const createLoggedAgentSpawn =
  (params: CreateLoggedAgentSpawnParams): SpawnAgentProcessFn =>
  (input) =>
    params.spawnAgentProcess({
      ...input,
      onStderrLine: (line) => {
        params.appendLog({
          ts: new Date().toISOString(),
          level: "info",
          source: "agent",
          agentId: input.profile.id,
          message: line,
        })
      },
    })
