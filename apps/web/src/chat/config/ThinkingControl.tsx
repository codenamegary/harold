import React from "react"
import { ConfigOption, ConfigOptionValue } from "contracts/http/config.options"
import { stripThinkingPrefix } from "./thinking.label"

export const ThinkingControl: React.FC<{
  option: ConfigOption
  onCycle: (next: ConfigOptionValue) => void
  saving?: boolean
  disabled?: boolean
}> = ({ option, onCycle, saving = false, disabled = false }) => {
  if (option.type !== "select") {
    return null
  }

  const idx = Math.max(
    0,
    option.options.findIndex((item) => item.value === option.currentValue),
  )
  const current = option.options[idx]
  const next = option.options[(idx + 1) % option.options.length]
  const level = stripThinkingPrefix(current?.name ?? option.currentValue)
  const nextLevel =
    next === undefined ? undefined : stripThinkingPrefix(next.name)
  const label = `Thinking: ${level}`

  const handlePress = () => {
    if (next === undefined || disabled) {
      return
    }
    onCycle(next)
  }

  return (
    <button
      type="button"
      disabled={disabled}
      onClick={handlePress}
      aria-label={`Thinking: ${level}, level ${idx + 1} of ${option.options.length}. Press for ${nextLevel ?? "next"}.`}
      className="inline-flex shrink-0 cursor-pointer items-center truncate rounded px-0.5 font-mono text-xs outline-none focus-visible:ring-1 focus-visible:ring-current disabled:cursor-not-allowed disabled:opacity-50"
    >
      <span className={`truncate${saving ? " config-saving-label" : ""}`}>{label}</span>
    </button>
  )
}
