import React from "react"

type ThinkingIndicatorProps = {
  label?: string
}

export const ThinkingIndicator: React.FC<ThinkingIndicatorProps> = ({
  label = "Thinking",
}) => {
  return (
    <span className="thinking-indicator inline-flex items-center" aria-hidden>
      <span className="thinking-indicator-label wrap-anywhere">{label}</span>
    </span>
  )
}
