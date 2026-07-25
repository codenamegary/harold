import React, { ComponentPropsWithoutRef, ReactNode } from "react"

type FieldLabelProps = {
  children: ReactNode
} & ComponentPropsWithoutRef<"label">

export const FieldLabel: React.FC<FieldLabelProps> = ({
  children,
  className = "",
  ...props
}) => (
  <label
    className={`mt-[17px] mb-[7px] block text-[9px] text-label ${className}`}
    {...props}
  >
    {children}
  </label>
)
