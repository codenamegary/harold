import { ComponentPropsWithoutRef, ReactNode } from "react"

type NavItemProps = {
  active?: boolean
  icon?: ReactNode
  children: ReactNode
  "aria-disabled"?: boolean
} & ComponentPropsWithoutRef<"button">

export const NavItem = ({
  active = false,
  icon,
  children,
  className = "",
  disabled,
  "aria-disabled": ariaDisabled,
  ...props
}: NavItemProps) => {
  const isDisabled = disabled === true || ariaDisabled === true
  const disabledClasses = isDisabled ? "opacity-50 pointer-events-none" : ""
  const activeClasses = active
    ? "bg-[#151920] text-slate-200 shadow-[inset_0_0_0_1px_#222935] before:absolute before:-left-2.5 before:h-4 before:w-0.5 before:rounded-sm before:bg-lime"
    : "text-[#7f8998] hover:bg-[#11151b] hover:text-slate-200"

  return (
    <button
      type="button"
      disabled={disabled}
      aria-disabled={ariaDisabled}
      aria-current={active ? "page" : undefined}
      className={`relative flex min-h-10 w-full items-center gap-[11px] rounded-[7px] border-0 bg-transparent px-2.5 text-left text-[13px] cursor-pointer ${activeClasses} ${disabledClasses} ${className}`}
      {...props}
    >
      <span className={`grid w-[18px] place-items-center font-mono text-base ${active ? "text-lime" : "text-[#6e7888]"}`}>
        {icon}
      </span>
      {children}
    </button>
  )
}
