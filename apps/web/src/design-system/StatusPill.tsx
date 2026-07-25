import { ComponentPropsWithoutRef, ReactNode } from "react"

type StatusPillVariant = "default" | "success" | "violet"

type StatusPillProps = {
  variant?: StatusPillVariant
  children: ReactNode
} & ComponentPropsWithoutRef<"span">

const variantClasses: Record<StatusPillVariant, string> = {
  default: "bg-[#181d25] text-[#a6afbc]",
  success: "border border-lime/13 bg-lime/10 text-lime",
  violet: "border border-violet/16 bg-violet/12 text-[#c0b6ff]",
}

export const StatusPill = ({
  variant = "default",
  children,
  className = "",
  ...props
}: StatusPillProps) => (
  <span
    className={`inline-flex min-h-5 items-center rounded-[5px] px-[7px] font-mono text-[8px] ${variantClasses[variant]} ${className}`}
    {...props}
  >
    {children}
  </span>
)
