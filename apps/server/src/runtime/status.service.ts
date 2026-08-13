import { AgentServerState } from "contracts/http/status"
import { Runtime } from "./runtime"

type RuntimeStatusServiceContext = {
  runtime: Runtime
}

export const createRuntimeStatusService = (context: RuntimeStatusServiceContext) => {
  const persist = (state: AgentServerState): void => {
    context.runtime.setState(state)
  }

  return {
    persistStarting: () => persist("starting"),
    persistOnline: () => persist("online"),
    persistShuttingDown: () => persist("shutting_down"),
    persistOffline: () => persist("offline"),
  }
}

export type RuntimeStatusService = ReturnType<typeof createRuntimeStatusService>
