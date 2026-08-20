import React, { ComponentPropsWithoutRef, ReactNode } from "react"

type NavItemProps = {
  active?: boolean
  icon?: ReactNode
  children: ReactNode
  "aria-disabled"?: boolean
} & ComponentPropsWithoutRef<"button">

export const NavItem: React.FC<NavItemProps> = ({
  active = false,
  icon,
  children,
  className = "",
  disabled,
  "aria-disabled": ariaDisabled,
  ...props
}) => {
  const isDisabled = disabled === true || ariaDisabled === true
  const disabledClasses = isDisabled ? "opacity-50 pointer-events-none" : ""
  const activeClasses = active
    ? "bg-surface-raised text-slate-200 ring-1 ring-inset ring-nav-active-ring before:absolute before:-left-2.5 before:h-4 before:w-0.5 before:rounded-sm before:bg-lime"
    : "text-nav hover:bg-nav-hover hover:text-slate-200"

  return (
    <button
      type="button"
      disabled={disabled}
      aria-disabled={ariaDisabled}
      aria-current={active ? "page" : undefined}
      className={`relative flex min-h-10 w-full items-center gap-[11px] rounded-[7px] border-0 bg-transparent px-2.5 text-left text-sm cursor-pointer ${activeClasses} ${disabledClasses} ${className}`}
      {...props}
    >
      <span
        aria-hidden
        className={`grid w-7 place-items-center font-mono text-2xl leading-none ${active ? "text-lime" : "text-nav-icon"}`}
      >
        {icon}
      </span>
      {children}
    </button>
  )
}
