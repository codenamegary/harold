import React, { ComponentPropsWithoutRef } from "react"

type ButtonVariant = "primary" | "secondary" | "text"

type ButtonProps = {
  variant?: ButtonVariant
  "aria-disabled"?: boolean
} & ComponentPropsWithoutRef<"button">

const variantClasses: Record<ButtonVariant, string> = {
  primary:
    "bg-lime border border-lime text-lime-ink shadow-[0_0_0_1px_rgba(0,0,0,0.18),inset_0_1px_rgba(255,255,255,0.25)] hover:bg-lime-hover",
  secondary:
    "bg-panel-2 text-body border border-line-strong hover:bg-hover-surface-strong hover:border-line-hover-strong hover:text-white",
  text: "bg-transparent text-body-soft hover:text-lime",
}

export const Button: React.FC<ButtonProps> = ({
  variant = "primary",
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
      className={`inline-flex min-h-9 items-center justify-center gap-3 rounded-[7px] px-3.5 text-[11px] font-semibold whitespace-nowrap cursor-pointer ${variantClasses[variant]} ${disabledClasses} ${className}`}
      {...props}
    >
      {children}
    </button>
  )
}
