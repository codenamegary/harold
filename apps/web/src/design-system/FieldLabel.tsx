import React, { ComponentPropsWithoutRef, ReactNode } from "react"

type FieldLabelProps = {
  children: ReactNode
} & ComponentPropsWithoutRef<"label">

export const FieldLabel: React.FC<FieldLabelProps> = ({ children, className = "", ...props }) => (
  <label className={`mt-4.5 mb-2 block text-xs text-muted ${className}`} {...props}>
    {children}
  </label>
)
