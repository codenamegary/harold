export type ConnectionPhase = "loading" | "online" | "unreachable"

type StatusDotVariant = "online" | "warning" | "offline" | "error"

type ConnectionPhaseChrome = {
  sidebarDotVariant: StatusDotVariant
  topbarLabel: string
  showLiveBadge: boolean
  topbarAlert: boolean
}

export const connectionPhaseChromeByPhase: Record<
  ConnectionPhase,
  ConnectionPhaseChrome
> = {
  loading: {
    sidebarDotVariant: "warning",
    topbarLabel: "Checking API",
    showLiveBadge: false,
    topbarAlert: false,
  },
  online: {
    sidebarDotVariant: "online",
    topbarLabel: "API connected",
    showLiveBadge: true,
    topbarAlert: false,
  },
  unreachable: {
    sidebarDotVariant: "error",
    topbarLabel: "API unreachable",
    showLiveBadge: false,
    topbarAlert: true,
  },
}
