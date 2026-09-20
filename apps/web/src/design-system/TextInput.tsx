import { ComponentPropsWithoutRef, forwardRef } from "react"

type TextInputProps = {
  "aria-disabled"?: boolean
} & ComponentPropsWithoutRef<"input">

export const TextInput = forwardRef<HTMLInputElement, TextInputProps>(
  ({ className = "", disabled, "aria-disabled": ariaDisabled, ...props }, ref) => {
    const isDisabled = disabled === true || ariaDisabled === true
    const disabledClasses = isDisabled ? "opacity-50 pointer-events-none" : ""

    return (
      <input
        ref={ref}
        disabled={disabled}
        aria-disabled={ariaDisabled}
        className={`min-h-10 w-full rounded-md border border-line-input bg-surface-deep px-3 text-sm text-input outline-none focus:border-lime/40 ${disabledClasses} ${className}`}
        {...props}
      />
    )
  },
)

TextInput.displayName = "TextInput"
