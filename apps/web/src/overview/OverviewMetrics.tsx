import React from "react"
import { useConnection } from "../connection/use.connection"
import { useServerElapsedSeconds } from "../connection/use.server.elapsed.seconds"
import { MetricCard } from "../design-system/MetricCard"
import { StatusPill } from "../design-system/StatusPill"
import { serverStatusDisplay } from "./server.status.display"

type ComingSoonMetricCardProps = {
  title: string
  footLabel: string
  accent?: "lime" | "violet"
}

const ComingSoonMetricCard: React.FC<ComingSoonMetricCardProps> = ({
  title,
  footLabel,
  accent,
}) => (
  <MetricCard accent={accent} aria-label={title} className="opacity-60">
    <div className="flex items-center justify-between text-xs text-muted">
      <span>{title}</span>
    </div>
    <div className="my-[18px] text-3xl font-semibold tracking-[-0.04em] text-dim">
      Coming soon
    </div>
    <div className="flex items-center justify-between text-xs text-muted">
      <span>{footLabel}</span>
    </div>
  </MetricCard>
)

export const OverviewMetrics: React.FC = () => {
  const { connection } = useConnection()
  const statusState = connection.phase === "online" ? connection.status.state : null
  const startedAt = connection.phase === "online" ? connection.status.startedAt : null
  const elapsedSeconds = useServerElapsedSeconds(startedAt)
  const serverStatus = serverStatusDisplay(connection.phase, statusState, elapsedSeconds)

  return (
    <div className="mb-2.5 grid grid-cols-4 gap-2.5 max-[1100px]:grid-cols-2 max-[640px]:grid-cols-1">
      <MetricCard accent="lime" aria-label="Server status">
        <div className="flex items-center justify-between text-xs text-muted">
          <span>Server status</span>
          {serverStatus.pill ? <StatusPill variant="success">{serverStatus.pill}</StatusPill> : null}
        </div>
        <div className="my-[18px] text-3xl font-semibold tracking-[-0.04em]">
          {serverStatus.value}
        </div>
        <div className="flex items-center justify-between text-xs text-muted">
          <span>Uptime</span>
          {serverStatus.uptime ? (
            <strong className="font-mono text-xs font-medium text-[#c3c9d2]">
              {serverStatus.uptime}
            </strong>
          ) : null}
        </div>
      </MetricCard>

      <ComingSoonMetricCard accent="violet" footLabel="Median response" title="ACP runtime" />
      <ComingSoonMetricCard footLabel="Paired devices" title="Active now" />
      <ComingSoonMetricCard footLabel="Success rate" title="Requests today" />
    </div>
  )
}
