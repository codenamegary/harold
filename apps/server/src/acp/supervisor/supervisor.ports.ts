import { AgentProfile } from "../agent.profile"
import { SpawnedAgentProcess } from "./models"

/**
 * Port satisfied by the process adapter (`supervisor.process.adapters.ts`).
 * The public capability record lives in `./supervisor`, dependency records in
 * `./models`.
 */
export type SpawnAgentProcessFn = (input: {
  profile: AgentProfile
  executablePath: string
  args: readonly string[]
}) => SpawnedAgentProcess
