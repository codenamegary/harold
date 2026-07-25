import { AgentServerState } from "contracts/http/status"

export type Runtime = {
  readonly version: string
  readonly startedAt: string
  getState: () => AgentServerState
  setState: (state: AgentServerState) => void
}

export const createRuntime = (version: string): Runtime => {
  const startedAt = new Date().toISOString()
  const stateCell = { value: "starting" as AgentServerState }

  return {
    version,
    startedAt,
    getState: () => stateCell.value,
    setState: (state) => {
      stateCell.value = state
    },
  }
}
