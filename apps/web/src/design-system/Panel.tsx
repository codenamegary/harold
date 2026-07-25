import { ComponentPropsWithoutRef, ReactNode } from "react"

type PanelProps = {
  children: ReactNode
} & ComponentPropsWithoutRef<"section">

export const Panel = ({ children, className = "", ...props }: PanelProps) => (
  <section
    className={`overflow-hidden rounded-[9px] border border-line-soft bg-panel ${className}`}
    {...props}
  >
    {children}
  </section>
)
