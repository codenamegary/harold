import React, { ComponentPropsWithoutRef } from "react"

type TextInputProps = {
  "aria-disabled"?: boolean
} & ComponentPropsWithoutRef<"input">

export const TextInput: React.FC<TextInputProps> = ({
  className = "",
  disabled,
  "aria-disabled": ariaDisabled,
  ...props
}) => {
  const isDisabled = disabled === true || ariaDisabled === true
  const disabledClasses = isDisabled ? "opacity-50 pointer-events-none" : ""

  return (
    <input
      disabled={disabled}
      aria-disabled={ariaDisabled}
      className={`min-h-10 w-full rounded-md border border-line-input bg-surface-deep px-[11px] text-[10px] text-input outline-none focus:border-lime/40 ${disabledClasses} ${className}`}
      {...props}
    />
  )
}
