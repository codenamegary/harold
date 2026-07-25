import { ComponentPropsWithoutRef } from "react"

type ButtonVariant = "primary" | "secondary" | "text"

type ButtonProps = {
  variant?: ButtonVariant
  "aria-disabled"?: boolean
} & ComponentPropsWithoutRef<"button">

const variantClasses: Record<ButtonVariant, string> = {
  primary:
    "bg-lime border border-lime text-[#10150c] shadow-[0_0_0_1px_rgba(0,0,0,0.18),inset_0_1px_rgba(255,255,255,0.25)] hover:bg-[#c2ff78]",
  secondary:
    "bg-[#12161d] text-[#c4cad3] border border-[#2a313d] hover:bg-[#181d25] hover:border-[#3a4350] hover:text-white",
  text: "bg-transparent text-[#98a1ae] hover:text-lime",
}

export const Button = ({
  variant = "primary",
  className = "",
  disabled,
  "aria-disabled": ariaDisabled,
  children,
  ...props
}: ButtonProps) => {
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
