import React, { ComponentPropsWithoutRef } from "react"

export type StatusDotVariant = "online" | "warning" | "offline"

type StatusDotProps = {
  variant: StatusDotVariant
} & ComponentPropsWithoutRef<"span">

const variantClasses: Record<StatusDotVariant, string> = {
  online: "bg-lime shadow-glow shadow-lime/40",
  warning: "bg-amber",
  offline: "bg-danger shadow-glow shadow-danger/40",
}

export const StatusDot: React.FC<StatusDotProps> = ({ variant, className = "", ...props }) => (
  <span
    aria-label={`${variant} status`}
    className={`inline-block size-2 shrink-0 rounded-full ${variantClasses[variant]} ${className}`}
    {...props}
  />
)
