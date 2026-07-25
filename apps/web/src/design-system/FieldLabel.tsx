import { ComponentPropsWithoutRef, ReactNode } from "react"

type FieldLabelProps = {
  children: ReactNode
} & ComponentPropsWithoutRef<"label">

export const FieldLabel = ({
  children,
  className = "",
  ...props
}: FieldLabelProps) => (
  <label
    className={`mt-[17px] mb-[7px] block text-[9px] text-label ${className}`}
    {...props}
  >
    {children}
  </label>
)
