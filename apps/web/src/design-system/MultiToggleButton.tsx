import React from "react"
import { ConfigOption, ConfigOptionValue } from "contracts/http/config.options"

export type MultiToggleButtonProps = {
  option: ConfigOption
  colorClassName?: (value: string) => string | undefined
  onCycle: (next: ConfigOptionValue) => void
  className?: string
  children: React.ReactNode
  disabled?: boolean
} & Omit<React.ComponentPropsWithoutRef<"button">, "value" | "onClick" | "disabled" | "className" | "children">

/**
 * One control that steps through an ordered option list, one value per press.
 * The value never reaches the DOM; the label is the child. The wrapper carries
 * `colorClassName(value)` for the current value — an app concern, unknown
 * values return undefined and get no identity color.
 */
export const MultiToggleButton: React.FC<MultiToggleButtonProps> = ({
  option,
  colorClassName,
  onCycle,
  className = "",
  children,
  disabled = false,
  ...props
}) => {
  if (option.type !== "select") {
    return null
  }

  const current = option.options.find((item) => item.value === option.currentValue)
  const next =
    option.options.length > 1
      ? option.options[(option.options.findIndex((item) => item.value === option.currentValue) + 1) % option.options.length]
      : undefined

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
      className={`cursor-pointer rounded px-0.5 font-mono text-xs outline-none focus-visible:ring-1 focus-visible:ring-current disabled:cursor-not-allowed disabled:opacity-50 ${colorClassName?.(option.currentValue) ?? ""} ${className}`}
      {...props}
    >
      {children ?? current?.name}
    </button>
  )
}
