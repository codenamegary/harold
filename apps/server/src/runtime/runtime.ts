import { RelayStateSchema } from "contracts/http/status"
import { z } from "zod"

export type RelayState = z.infer<typeof RelayStateSchema>

export type Runtime = {
  readonly version: string
  readonly startedAt: string
  getState: () => RelayState
  setState: (state: RelayState) => void
}

export const createRuntime = (version: string): Runtime => {
  const startedAt = new Date().toISOString()
  const stateCell = { value: "starting" as RelayState }

  return {
    version,
    startedAt,
    getState: () => stateCell.value,
    setState: (state) => {
      stateCell.value = state
    },
  }
}
