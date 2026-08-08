import React from "react"
import { ThinkingIndicator } from "./ThinkingIndicator"

type ActivityStatusLineProps = {
  label: string
  subtitle?: string
}

export const ActivityStatusLine: React.FC<ActivityStatusLineProps> = ({
  label,
  subtitle,
}) => {
  const ariaLabel =
    subtitle === undefined || subtitle.length === 0
      ? label
      : `${label}: ${subtitle}`

  return (
    <div
      className="flex flex-col gap-0.5 px-1"
      role="status"
      aria-live="polite"
      aria-label={ariaLabel}
      data-testid="activity-status-line"
    >
      <ThinkingIndicator label={label} />
      {subtitle !== undefined && subtitle.length > 0 ? (
        <span className="font-mono text-sm text-dim">{subtitle}</span>
      ) : null}
    </div>
  )
}
