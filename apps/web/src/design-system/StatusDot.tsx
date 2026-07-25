import { ComponentPropsWithoutRef } from "react"

type StatusDotVariant = "online" | "warning" | "offline"

type StatusDotProps = {
  variant: StatusDotVariant
} & ComponentPropsWithoutRef<"span">

const variantClasses: Record<StatusDotVariant, string> = {
  online: "bg-lime shadow-[0_0_9px] shadow-lime/40",
  warning: "bg-amber",
  offline: "bg-offline",
}

export const StatusDot = ({
  variant,
  className = "",
  ...props
}: StatusDotProps) => (
  <span
    aria-label={`${variant} status`}
    className={`inline-block size-[7px] shrink-0 rounded-full ${variantClasses[variant]} ${className}`}
    {...props}
  />
)
