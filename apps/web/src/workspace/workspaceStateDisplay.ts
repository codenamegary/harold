import { WorkspaceState } from "contracts/http/workspace"

type StatusDotVariant = "online" | "warning" | "offline"

type WorkspaceStateDisplay = {
  label: string
  dotVariant: StatusDotVariant
}

export const workspaceStateDisplayByState: Record<WorkspaceState, WorkspaceStateDisplay> = {
  available: { label: "Available", dotVariant: "online" },
  missing: { label: "Missing", dotVariant: "warning" },
  unavailable: { label: "Unavailable", dotVariant: "offline" },
}
