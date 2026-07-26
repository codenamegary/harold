import { WorkspaceState } from "contracts/http/workspace"

type StatusPillVariant = "default" | "success" | "violet"

type WorkspaceStateDisplay = {
  label: string
  variant: StatusPillVariant
}

export const workspaceStateDisplayByState: Record<WorkspaceState, WorkspaceStateDisplay> = {
  available: { label: "Available", variant: "success" },
  missing: { label: "Missing", variant: "default" },
  unavailable: { label: "Unavailable", variant: "default" },
}
