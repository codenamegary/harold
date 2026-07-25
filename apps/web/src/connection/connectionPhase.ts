export type ConnectionPhase = "loading" | "online" | "unreachable"

type StatusDotVariant = "online" | "warning" | "offline"

type ConnectionPhaseChrome = {
  sidebarDotVariant: StatusDotVariant
  topbarLabel: string
  showLiveBadge: boolean
}

export const connectionPhaseChromeByPhase: Record<
  ConnectionPhase,
  ConnectionPhaseChrome
> = {
  loading: {
    sidebarDotVariant: "warning",
    topbarLabel: "Checking API",
    showLiveBadge: false,
  },
  online: {
    sidebarDotVariant: "online",
    topbarLabel: "API connected",
    showLiveBadge: true,
  },
  unreachable: {
    sidebarDotVariant: "offline",
    topbarLabel: "API unreachable",
    showLiveBadge: false,
  },
}
