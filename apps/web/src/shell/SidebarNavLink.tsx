import React, { ReactNode } from "react"
import { NavLink, NavLinkProps } from "react-router"

type SidebarNavLinkProps = {
  icon: ReactNode
  badge?: string
  subtle?: boolean
  children: ReactNode
} & Omit<NavLinkProps, "className" | "children">

const baseClasses =
  "group relative flex min-h-10 w-full items-center gap-3 rounded-md border-0 bg-transparent px-2.5 text-left text-base no-underline cursor-pointer"

const inactiveClasses = "text-nav hover:bg-nav-hover hover:text-input"
const activeClasses =
  "bg-surface-raised text-input ring-1 ring-inset ring-nav-active-ring before:absolute before:-left-2.5 before:h-4 before:w-0.5 before:rounded-sm before:bg-lime"
const subtleInactiveClasses = "text-dim hover:bg-nav-hover hover:text-input"

export const SidebarNavLink: React.FC<SidebarNavLinkProps> = ({
  icon,
  badge,
  subtle = false,
  children,
  ...props
}) => (
  <NavLink
    {...props}
    className={({ isActive }) => {
      const stateClasses = isActive
        ? activeClasses
        : subtle
          ? subtleInactiveClasses
          : inactiveClasses
      return `${baseClasses} ${stateClasses}`
    }}
  >
    <span
      aria-hidden
      className="grid place-items-center text-nav group-aria-[current=page]:text-lime"
    >
      {icon}
    </span>
    {children}
    {badge !== undefined ? (
      <span className="ml-auto grid min-w-5 h-5 place-items-center rounded-lg bg-lime px-1.5 font-mono text-xs text-lime-ink">
        {badge}
      </span>
    ) : null}
  </NavLink>
)
