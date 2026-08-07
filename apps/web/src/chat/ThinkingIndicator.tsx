import React from "react"

type ThinkingIndicatorProps = {
  label?: string
}

export const ThinkingIndicator: React.FC<ThinkingIndicatorProps> = ({
  label = "Thinking",
}) => {
  return (
    <span
      className="thinking-indicator inline-flex items-center"
      role="status"
      aria-live="polite"
      aria-label={label}
    >
      <span aria-hidden className="thinking-indicator-label">
        {label}
      </span>
    </span>
  )
}
