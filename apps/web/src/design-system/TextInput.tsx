import { ComponentPropsWithoutRef } from "react"

type TextInputProps = {
  "aria-disabled"?: boolean
} & ComponentPropsWithoutRef<"input">

export const TextInput = ({
  className = "",
  disabled,
  "aria-disabled": ariaDisabled,
  ...props
}: TextInputProps) => {
  const isDisabled = disabled === true || ariaDisabled === true
  const disabledClasses = isDisabled ? "opacity-50 pointer-events-none" : ""

  return (
    <input
      disabled={disabled}
      aria-disabled={ariaDisabled}
      className={`min-h-10 w-full rounded-md border border-[#2e3540] bg-[#090c10] px-[11px] text-[10px] text-[#c7ced7] outline-none focus:border-lime/40 ${disabledClasses} ${className}`}
      {...props}
    />
  )
}
