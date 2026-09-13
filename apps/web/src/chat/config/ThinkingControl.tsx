import React from "react"
import { ConfigOption, ConfigOptionValue } from "contracts/http/config-options"
import { ProgressButton } from "../../design-system/ProgressButton"

export const ThinkingControl: React.FC<{
  option: ConfigOption
  onCycle: (next: ConfigOptionValue) => void
  disabled?: boolean
}> = ({ option, onCycle, disabled = false }) => {
  if (option.type !== "select") {
    return null
  }

  const idx = Math.max(
    0,
    option.options.findIndex((item) => item.value === option.currentValue),
  )
  const current = option.options[idx]
  const next = option.options[(idx + 1) % option.options.length]
  const label = current?.name ?? option.currentValue

  return (
    <ProgressButton
      option={option}
      onCycle={onCycle}
      disabled={disabled}
      fillClassName="bg-lime"
      aria-label={`Thinking: ${label}, level ${idx + 1} of ${option.options.length}. Press for ${next?.name ?? "next"}.`}
    >
      {label}
    </ProgressButton>
  )
}
