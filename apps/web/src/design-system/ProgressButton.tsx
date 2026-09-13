import React from "react"
import { ConfigOption, ConfigOptionValue } from "contracts/http/config-options"

export type ProgressButtonProps = {
  option: ConfigOption
  onCycle: (next: ConfigOptionValue) => void
  className?: string
  fillClassName?: string
  children: React.ReactNode
  disabled?: boolean
} & Omit<React.ComponentPropsWithoutRef<"button">, "value" | "onClick" | "disabled" | "className" | "children">

/**
 * A cycle control with a thick left-anchored underline instead of a color
 * identity or a fill. The underline encodes the current cycle index:
 * off is no line, the last level is a full line. No per-level colors.
 */
export const ProgressButton: React.FC<ProgressButtonProps> = ({
  option,
  onCycle,
  className = "",
  fillClassName = "",
  children,
  disabled = false,
  ...props
}) => {
  if (option.type !== "select") {
    return null
  }

  const levels = option.options
  const idx = Math.max(0, levels.findIndex((item) => item.value === option.currentValue))
  const fill = Math.round((idx / Math.max(levels.length - 1, 1)) * 100)
  const next =
    levels.length > 1
      ? levels[(idx + 1) % levels.length]
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
      className={`relative rounded pb-1 font-mono text-xs outline-none focus-visible:ring-1 focus-visible:ring-current disabled:cursor-not-allowed disabled:opacity-50 ${className}`}
      {...props}
    >
      {children}
      <span
        aria-hidden
        data-underline={String(fill)}
        className={`absolute bottom-0 left-0 h-[3px] ${fillClassName}`}
        style={{ width: `${fill}%` }}
      />
    </button>
  )
}
