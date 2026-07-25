import React, { ReactNode } from "react"
import { NavLink, NavLinkProps } from "react-router"

type SidebarNavLinkProps = {
  icon: ReactNode
  badge?: string
  subtle?: boolean
  children: ReactNode
} & Omit<NavLinkProps, "className" | "children">

const baseClasses =
  "group relative flex min-h-10 w-full items-center gap-[11px] rounded-[7px] border-0 bg-transparent px-2.5 text-left text-sm no-underline cursor-pointer"

const inactiveClasses = "text-nav hover:bg-nav-hover hover:text-slate-200"
const activeClasses =
  "bg-surface-raised text-slate-200 ring-1 ring-inset ring-nav-active-ring before:absolute before:-left-2.5 before:h-4 before:w-0.5 before:rounded-sm before:bg-lime"
const subtleInactiveClasses = "text-dim hover:bg-nav-hover hover:text-slate-200"

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
      const stateClasses = isActive ? activeClasses : subtle ? subtleInactiveClasses : inactiveClasses
      return `${baseClasses} ${stateClasses}`
    }}
  >
    <span
      aria-hidden
      className="grid w-[18px] place-items-center font-mono text-base text-nav-icon group-aria-[current=page]:text-lime"
    >
      {icon}
    </span>
    {children}
    {badge !== undefined ? (
      <span className="ml-auto grid min-w-[19px] h-[19px] place-items-center rounded-[10px] bg-lime px-[5px] font-mono text-xs text-lime-ink">
        {badge}
      </span>
    ) : null}
  </NavLink>
)
