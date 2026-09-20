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
    className={`mb-2.5 flex items-center gap-2 font-mono text-xs tracking-widest text-lime uppercase ${className}`}
    {...props}
  >
    {children}
  </p>
)
