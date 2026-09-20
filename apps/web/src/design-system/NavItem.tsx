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
    ? "bg-surface-raised text-input ring-1 ring-inset ring-nav-active-ring before:absolute before:-left-2.5 before:h-4 before:w-0.5 before:rounded-sm before:bg-lime"
    : "text-nav hover:bg-nav-hover hover:text-input"

  return (
    <button
      type="button"
      disabled={disabled}
      aria-disabled={ariaDisabled}
      aria-current={active ? "page" : undefined}
      className={`relative flex min-h-10 w-full items-center gap-3 rounded-md border-0 bg-transparent px-2.5 text-left text-base cursor-pointer ${activeClasses} ${disabledClasses} ${className}`}
      {...props}
    >
      <span aria-hidden className={`grid place-items-center ${active ? "text-lime" : "text-nav"}`}>
        {icon}
      </span>
      {children}
    </button>
  )
}
