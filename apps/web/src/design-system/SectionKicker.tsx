import React, { ComponentPropsWithoutRef, ReactNode } from "react"

type SectionKickerProps = {
  children: ReactNode
} & ComponentPropsWithoutRef<"p">

export const SectionKicker: React.FC<SectionKickerProps> = ({
  children,
  className = "",
  ...props
}) => (
  <p
    className={`mb-2.5 flex items-center gap-[7px] font-mono text-[9px] tracking-[0.12em] text-lime uppercase ${className}`}
    {...props}
  >
    {children}
  </p>
)
