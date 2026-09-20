import React, { ComponentPropsWithoutRef } from "react"

type IconButtonProps = {
  "aria-disabled"?: boolean
} & ComponentPropsWithoutRef<"button">

export const IconButton: React.FC<IconButtonProps> = ({
  className = "",
  disabled,
  "aria-disabled": ariaDisabled,
  children,
  ...props
}) => {
  const isDisabled = disabled === true || ariaDisabled === true
  const disabledClasses = isDisabled ? "opacity-50 pointer-events-none" : ""

  return (
    <button
      type="button"
      disabled={disabled}
      aria-disabled={ariaDisabled}
      className={`grid size-8.5 place-items-center rounded-md border border-line bg-surface text-body-soft cursor-pointer hover:border-line-hover hover:bg-hover-surface hover:text-input ${disabledClasses} ${className}`}
      {...props}
    >
      {children}
    </button>
  )
}
