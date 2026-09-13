import React from "react"
import { ConfigOption, ConfigOptionValue } from "contracts/http/config.options"
import { MultiToggleButton } from "../../design-system/MultiToggleButton"
import { modeTextClass } from "./mode.colors"

export const ModeToggle: React.FC<{
  option: ConfigOption
  onCycle: (next: ConfigOptionValue) => void
  disabled?: boolean
}> = ({ option, onCycle, disabled = false }) => {
  if (option.type !== "select") {
    return null
  }

  const current = option.options.find((item) => item.value === option.currentValue)
  const idx = option.options.findIndex((item) => item.value === option.currentValue)
  const next = option.options[(idx + 1) % option.options.length]
  const label = current?.name ?? option.currentValue

  return (
    <MultiToggleButton
      option={option}
      colorClassName={modeTextClass}
      onCycle={onCycle}
      disabled={disabled}
      aria-label={`Mode: ${label}. Press for ${next?.name ?? "next"}.`}
    >
      {label}
    </MultiToggleButton>
  )
}
