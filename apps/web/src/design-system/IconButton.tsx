import { ComponentPropsWithoutRef } from "react"

type IconButtonProps = {
  "aria-disabled"?: boolean
} & ComponentPropsWithoutRef<"button">

export const IconButton = ({
  className = "",
  disabled,
  "aria-disabled": ariaDisabled,
  children,
  ...props
}: IconButtonProps) => {
  const isDisabled = disabled === true || ariaDisabled === true
  const disabledClasses = isDisabled ? "opacity-50 pointer-events-none" : ""

  return (
    <button
      type="button"
      disabled={disabled}
      aria-disabled={ariaDisabled}
      className={`grid size-[34px] place-items-center rounded-[7px] border border-line bg-surface text-icon cursor-pointer hover:border-line-hover hover:bg-hover-surface hover:text-slate-200 ${disabledClasses} ${className}`}
      {...props}
    >
      {children}
    </button>
  )
}
