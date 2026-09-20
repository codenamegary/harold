import { AcpSupervisorState, AcpSupervisorStatus } from "./models"

/**
 * Pure roll-up of per-agent runtime states into one supervisor status.
 * Precedence: ready > starting > error > stopped.
 */
export const aggregateStatus = (
  states: ReadonlyArray<AcpSupervisorState>,
  activeSessions: number,
): AcpSupervisorStatus => {
  if (states.length === 0) {
    return { state: "stopped", activeSessions }
  }

  if (states.some((state) => state === "ready")) {
    return { state: "ready", activeSessions }
  }
  if (states.some((state) => state === "starting")) {
    return { state: "starting", activeSessions }
  }
  if (states.some((state) => state === "error")) {
    return { state: "error", activeSessions }
  }
  return { state: "stopped", activeSessions }
}
