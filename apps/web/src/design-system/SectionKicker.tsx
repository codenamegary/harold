import { ComponentPropsWithoutRef, ReactNode } from "react"

type SectionKickerProps = {
  children: ReactNode
} & ComponentPropsWithoutRef<"p">

export const SectionKicker = ({
  children,
  className = "",
  ...props
}: SectionKickerProps) => (
  <p
    className={`mb-2.5 flex items-center gap-[7px] font-mono text-[9px] tracking-[0.12em] text-lime uppercase ${className}`}
    {...props}
  >
    {children}
  </p>
)
