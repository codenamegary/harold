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
  const hasSubtitle = subtitle !== undefined && subtitle.length > 0
  const ariaLabel = hasSubtitle ? `${label}: ${subtitle}` : label

  return (
    <div
      className="inline-flex max-w-full flex-col gap-0.5"
      role="status"
      aria-live="polite"
      aria-label={ariaLabel}
      data-testid="activity-status-line"
    >
      <ThinkingIndicator label={label} />
      {hasSubtitle ? (
        <span className="font-mono text-sm text-dim">{subtitle}</span>
      ) : null}
    </div>
  )
}
