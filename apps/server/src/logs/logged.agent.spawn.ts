import { LogBuffer } from "./log.buffer"
import {
  spawnAgentProcess,
  SpawnAgentProcessFn,
} from "../acp/supervisor/spawn-agent-process"

export const createLoggedAgentSpawn = (logBuffer: LogBuffer): SpawnAgentProcessFn =>
  (input) =>
    spawnAgentProcess({
      ...input,
      onStderrLine: (line) => {
        logBuffer.append({
          ts: new Date().toISOString(),
          level: "info",
          source: "agent",
          agentId: input.profile.id,
          message: line,
        })
      },
    })
