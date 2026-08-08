import React, { ComponentPropsWithoutRef, ReactNode } from "react"

type StatusPillVariant = "default" | "success" | "violet"
type StatusPillSize = "sm" | "md"

type StatusPillProps = {
  variant?: StatusPillVariant
  size?: StatusPillSize
  children: ReactNode
} & ComponentPropsWithoutRef<"span">

const variantClasses: Record<StatusPillVariant, string> = {
  default: "border border-transparent bg-panel-elevated text-pill",
  success: "border border-lime/13 bg-lime/10 text-lime",
  violet: "border border-violet/16 bg-violet/12 text-violet-soft",
}

const sizeClasses: Record<StatusPillSize, string> = {
  sm: "h-5 rounded-[5px] px-2 text-2xs",
  md: "h-[34px] rounded-[7px] px-3 text-xs",
}

export const StatusPill: React.FC<StatusPillProps> = ({
  variant = "default",
  size = "sm",
  children,
  className = "",
  ...props
}) => (
  <span
    className={`inline-flex box-border items-center justify-center whitespace-nowrap py-0 font-mono leading-none ${sizeClasses[size]} ${variantClasses[variant]} ${className}`}
    {...props}
  >
    {children}
  </span>
)
