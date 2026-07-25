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
      className={`grid size-[34px] place-items-center rounded-[7px] border border-line bg-[#101319] text-[#9ba5b4] cursor-pointer hover:border-[#3b4452] hover:bg-[#151a21] hover:text-slate-200 ${disabledClasses} ${className}`}
      {...props}
    >
      {children}
    </button>
  )
}
