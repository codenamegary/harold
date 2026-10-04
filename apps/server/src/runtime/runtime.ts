import { HaroldState } from "contracts/http/status"

export type Runtime = {
  readonly version: string
  readonly startedAt: string
  getState: () => HaroldState
  setState: (state: HaroldState) => void
}

export const createRuntime = (version: string): Runtime => {
  const startedAt = new Date().toISOString()
  const stateCell = { value: "starting" as HaroldState }

  return {
    version,
    startedAt,
    getState: () => stateCell.value,
    setState: (state) => {
      stateCell.value = state
    },
  }
}
