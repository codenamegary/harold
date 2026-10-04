import React, { useState } from "react"
import {
  ArrowUpRight,
  Folder,
  Menu,
  ScrollText,
  Settings,
  Smartphone,
  SquareTerminal,
} from "lucide-react"
import { Outlet, useLocation } from "react-router"
import { connectionPhaseChromeByPhase } from "../connection/connection.phase"
import { useConnection } from "../connection/use.connection"
import { IconButton } from "../design-system/IconButton"
import { StatusDot } from "../design-system/StatusDot"
import { AppMark } from "./AppMark"
import { SidebarNavLink } from "./SidebarNavLink"

type RouteMeta = {
  eyebrow: string
  title: string
}

const routeMetaByPath: Record<string, RouteMeta> = {
  "/connect": { eyebrow: "CONNECTION WIZARD", title: "Connect" },
  "/workspaces": { eyebrow: "PROJECTS & AGENTS", title: "Workspaces" },
  "/devices": { eyebrow: "ACCESS CONTROL", title: "Devices" },
  "/chat": { eyebrow: "SESSIONS", title: "Chat" },
  "/sessions": { eyebrow: "SESSIONS", title: "Sessions" },
  "/logs": { eyebrow: "SERVER", title: "Logs" },
  "/settings": { eyebrow: "SERVER", title: "Settings" },
}

export const AppShell: React.FC = () => {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const { pathname } = useLocation()
  const { connection } = useConnection()
  const routeMeta = routeMetaByPath[pathname]
  const eyebrow = routeMeta?.eyebrow ?? ""
  const title = routeMeta?.title ?? ""
  const connectionPhase = connection.phase
  const phaseChrome = connectionPhaseChromeByPhase[connectionPhase]
  const instanceAddress =
    connection.phase === "online"
      ? `${connection.status.bindAddress}:${connection.status.port}`
      : null
  const sidebarVersion = connection.phase === "online" ? connection.status.version : "—"

  const toggleSidebar = () => setSidebarOpen((open) => !open)
  const isImmersivePage = pathname === "/chat" || pathname === "/sessions" || pathname === "/logs"

  return (
    <div className="min-h-screen">
      <div
        id="toast-region"
        className="fixed right-4.5 bottom-4.5 z-50 flex flex-col gap-2"
        aria-live="polite"
      />

      <aside
        aria-label="Sidebar"
        data-sidebar-open={sidebarOpen ? "true" : "false"}
        className={`fixed inset-y-0 left-0 z-40 flex w-56 flex-col border-r border-line-soft bg-surface-deep px-3.5 pt-5.5 pb-4 transition-transform duration-200 ease-out max-[820px]:shadow-drawer max-[820px]:-translate-x-full ${sidebarOpen ? "max-[820px]:translate-x-0" : ""}`}
      >
        <div className="flex items-center gap-3 px-2 pb-6.5">
          <AppMark />
          <div>
            <div className="font-bold leading-tight tracking-tight">Harold</div>
            <div className="mt-1 font-mono text-xs uppercase tracking-widest text-dim">
              Operator console
            </div>
          </div>
        </div>

        <nav aria-label="Main navigation" className="flex flex-col gap-1">
          <SidebarNavLink to="/chat" icon={<SquareTerminal className="size-4.5" />}>
            Chat
          </SidebarNavLink>
          <SidebarNavLink to="/connect" icon={<ArrowUpRight className="size-4.5" />}>
            Connect
          </SidebarNavLink>
          <SidebarNavLink to="/workspaces" icon={<Folder className="size-4.5" />}>
            Workspaces
          </SidebarNavLink>
          <SidebarNavLink to="/devices" icon={<Smartphone className="size-4.5" />}>
            Devices
          </SidebarNavLink>
        </nav>

        <div className="mt-auto">
          <div className="mb-2 rounded-lg border border-line-soft bg-panel p-3">
            <div className="flex items-center gap-2 text-xs text-body">
              <StatusDot variant={phaseChrome.sidebarDotVariant} />
              <span>Local instance</span>
              {phaseChrome.showLiveBadge ? (
                <span className="ml-auto font-mono text-xs text-lime">LIVE</span>
              ) : null}
            </div>
            {phaseChrome.showLiveBadge && instanceAddress ? (
              <code className="mt-2 ml-3.5 block font-mono text-xs text-dim">
                {instanceAddress}
              </code>
            ) : null}
          </div>
          <SidebarNavLink to="/logs" subtle icon={<ScrollText className="size-4.5" />}>
            Logs
          </SidebarNavLink>
          <SidebarNavLink to="/settings" subtle icon={<Settings className="size-4.5" />}>
            Settings
          </SidebarNavLink>
          <div className="flex justify-between px-2.5 pt-3.5 font-mono text-xs text-dim">
            <span>harold</span>
            <span>{sidebarVersion}</span>
          </div>
        </div>
      </aside>

      <div
        className={`flex flex-col ml-56 max-[820px]:ml-0 ${
          isImmersivePage ? "h-svh overflow-hidden" : "min-h-screen"
        }`}
      >
        <header className="sticky top-0 z-30 flex h-18.5 shrink-0 items-center justify-between border-b border-line-soft bg-ink/90 px-8.5 backdrop-blur-lg max-[820px]:justify-start max-[820px]:px-4.5">
          <IconButton
            aria-label="Toggle navigation"
            className="mr-3 hidden max-[820px]:grid"
            onClick={toggleSidebar}
          >
            <Menu aria-hidden className="size-4.5" />
          </IconButton>
          <div>
            <div className="font-mono text-xs leading-tight tracking-widest text-nav">
              {eyebrow}
            </div>
            <h1 className="m-0 mt-1 text-xl font-semibold tracking-tight">{title}</h1>
          </div>
          <div className="flex items-center gap-2 max-[820px]:ml-auto">
            <div
              className={`flex h-8 items-center gap-2 rounded-md border px-2.5 text-xs max-[820px]:hidden ${
                phaseChrome.topbarAlert
                  ? "border-danger/25 bg-danger/5 text-danger"
                  : "border-line text-muted"
              }`}
              title="Status"
            >
              <StatusDot variant={phaseChrome.sidebarDotVariant} />
              <span>{phaseChrome.topbarLabel}</span>
            </div>
          </div>
        </header>

        {isImmersivePage ? (
          <div className="flex min-h-0 flex-1 flex-col">
            <Outlet />
          </div>
        ) : (
          <div className="mx-auto max-w-387.5 px-9 py-9 max-[820px]:px-4.5 max-[820px]:py-6.5 max-[640px]:px-3.5 max-[640px]:py-5.5">
            <Outlet />
          </div>
        )}
      </div>
    </div>
  )
}
