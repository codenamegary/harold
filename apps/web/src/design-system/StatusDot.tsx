import { ComponentPropsWithoutRef } from "react"

type StatusDotVariant = "online" | "warning" | "offline"

type StatusDotProps = {
  variant: StatusDotVariant
} & ComponentPropsWithoutRef<"span">

const variantClasses: Record<StatusDotVariant, string> = {
  online: "bg-lime shadow-[0_0_9px_rgba(182,243,107,0.4)]",
  warning: "bg-[#f4bc5f]",
  offline: "bg-[#505866]",
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
