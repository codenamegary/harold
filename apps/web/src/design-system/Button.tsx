import React, { ComponentPropsWithoutRef } from "react"

type ButtonVariant = "primary" | "submit" | "secondary" | "text"
type ButtonSize = "md" | "sm"

type ButtonProps = {
  variant?: ButtonVariant
  size?: ButtonSize
  "aria-disabled"?: boolean
} & ComponentPropsWithoutRef<"button">

const variantClasses: Record<ButtonVariant, string> = {
  primary:
    "bg-lime border border-lime text-lime-ink shadow-[0_0_0_1px_rgba(0,0,0,0.18),inset_0_1px_rgba(255,255,255,0.25)] hover:bg-lime-hover",
  submit:
    "bg-lime border border-lime text-lime-ink shadow-[0_0_0_1px_rgba(0,0,0,0.18),inset_0_1px_rgba(255,255,255,0.25)] hover:bg-lime-hover",
  secondary:
    "bg-panel-2 text-body border border-line-strong hover:bg-hover-surface-strong hover:border-line-hover-strong hover:text-white",
  text: "bg-transparent text-body-soft hover:text-lime",
}

const sizeClasses: Record<ButtonSize, string> = {
  md: "min-h-9 gap-3 px-3.5 text-base",
  sm: "min-h-7 gap-2 px-2.5 text-sm",
}

export const Button: React.FC<ButtonProps> = ({
  variant = "primary",
  size = "md",
  type = "button",
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
      type={type}
      disabled={disabled}
      aria-disabled={ariaDisabled}
      className={`inline-flex items-center justify-center rounded-[7px] font-semibold whitespace-nowrap cursor-pointer ${sizeClasses[size]} ${variantClasses[variant]} ${disabledClasses} ${className}`}
      {...props}
    >
      {children}
    </button>
  )
}
