import React, { ComponentPropsWithoutRef, ReactNode } from "react"

type PanelProps = {
  children: ReactNode
} & ComponentPropsWithoutRef<"section">

export const Panel: React.FC<PanelProps> = ({ children, className = "", ...props }) => (
  <section
    className={`overflow-hidden rounded-[9px] border border-line-soft bg-panel ${className}`}
    {...props}
  >
    {children}
  </section>
)
