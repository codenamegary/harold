import { ComponentPropsWithoutRef, forwardRef } from "react"

type ButtonVariant = "primary" | "submit" | "secondary" | "text" | "danger"
type ButtonSize = "md" | "sm" | "xs"

type ButtonProps = {
  variant?: ButtonVariant
  size?: ButtonSize
  "aria-disabled"?: boolean
} & ComponentPropsWithoutRef<"button">

const variantClasses: Record<ButtonVariant, string> = {
  primary: "bg-lime border border-lime text-lime-ink shadow-control hover:bg-lime-hover",
  submit: "bg-lime border border-lime text-lime-ink shadow-control hover:bg-lime-hover",
  secondary:
    "bg-panel-2 text-body border border-line-strong hover:bg-panel-elevated hover:border-line-hover-strong hover:text-white",
  text: "bg-transparent text-body-soft hover:text-lime",
  danger:
    "bg-danger/15 border border-danger/40 text-danger hover:border-danger/55 hover:bg-danger/25 hover:text-danger",
}

const sizeClasses: Record<ButtonSize, string> = {
  xs: "h-6 min-h-6 gap-1 px-2 text-xs leading-none",
  sm: "h-7 min-h-7 gap-2 px-2.5 text-sm",
  md: "min-h-9 gap-3 px-3.5 text-base",
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      variant = "primary",
      size = "md",
      type = "button",
      className = "",
      disabled,
      "aria-disabled": ariaDisabled,
      children,
      ...props
    },
    ref,
  ) => {
    const isDisabled = disabled === true || ariaDisabled === true
    const disabledClasses = isDisabled ? "opacity-50 pointer-events-none" : ""

    return (
      <button
        ref={ref}
        type={type}
        disabled={disabled}
        aria-disabled={ariaDisabled}
        className={`inline-flex items-center justify-center rounded-md font-semibold whitespace-nowrap cursor-pointer ${sizeClasses[size]} ${variantClasses[variant]} ${disabledClasses} ${className}`}
        {...props}
      >
        {children}
      </button>
    )
  },
)

Button.displayName = "Button"
