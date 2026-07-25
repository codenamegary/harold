import React, { useState } from "react"
import { Link, Outlet, useLocation } from "react-router"
import { useConnection } from "../connection/ConnectionProvider"
import { IconButton } from "../design-system/IconButton"
import { StatusDot } from "../design-system/StatusDot"
import { SidebarNavLink } from "./SidebarNavLink"

type RouteMeta = {
  eyebrow: string
  title: string
}

const routeMetaByPath: Record<string, RouteMeta> = {
  "/": { eyebrow: "LOCAL SERVER", title: "Overview" },
  "/connect": { eyebrow: "CONNECTION WIZARD", title: "Connect" },
  "/workspaces": { eyebrow: "PROJECTS & AGENTS", title: "Workspaces" },
  "/devices": { eyebrow: "ACCESS CONTROL", title: "Devices" },
  "/chat": { eyebrow: "LOCAL TEST", title: "Agent playground" },
  "/settings": { eyebrow: "SERVER", title: "Settings" },
}

const sidebarDotVariant = (
  phase: "loading" | "online" | "unreachable",
): "online" | "warning" | "offline" => {
  if (phase === "online") {
    return "online"
  }

  if (phase === "loading") {
    return "warning"
  }

  return "offline"
}

const topbarLabel = (phase: "loading" | "online" | "unreachable"): string => {
  if (phase === "online") {
    return "API connected"
  }

  if (phase === "unreachable") {
    return "API unreachable"
  }

  return "Checking API"
}

export const AppShell: React.FC = () => {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const { pathname } = useLocation()
  const { connection, refetch } = useConnection()
  const routeMeta = routeMetaByPath[pathname]
  const eyebrow = routeMeta?.eyebrow ?? ""
  const title = routeMeta?.title ?? ""
  const connectionPhase = connection.phase
  const instanceAddress =
    connection.phase === "online"
      ? `${connection.status.bindAddress}:${connection.status.port}`
      : null

  const closeSidebar = () => setSidebarOpen(false)
  const toggleSidebar = () => setSidebarOpen((open) => !open)

  return (
    <div className="min-h-screen">
      <div
        id="toast-region"
        className="fixed right-[18px] bottom-[18px] z-[100] flex flex-col gap-2"
        aria-live="polite"
      />

      <aside
        aria-label="Sidebar"
        data-sidebar-open={sidebarOpen ? "true" : "false"}
        className={`fixed inset-y-0 left-0 z-40 flex w-[224px] flex-col border-r border-line-soft bg-[#0a0c10] px-3.5 pt-[22px] pb-4 transition-transform duration-[220ms] ease-out max-[820px]:shadow-[12px_0_50px_rgba(0,0,0,0.4)] max-[820px]:-translate-x-full ${sidebarOpen ? "max-[820px]:translate-x-0" : ""}`}
      >
        <div className="flex items-center gap-[11px] px-2 pb-[26px]">
          <div
            aria-hidden
            className="relative size-8 overflow-hidden rounded-lg bg-lime"
          >
            <span className="absolute left-2 top-[9px] h-[3px] w-[17px] -rotate-[35deg] rounded-sm bg-[#0b1007]" />
            <span className="absolute left-[5px] top-[15px] h-[3px] w-[17px] -rotate-[35deg] rounded-sm bg-[#0b1007]" />
            <span className="absolute left-2 top-[21px] h-[3px] w-[17px] -rotate-[35deg] rounded-sm bg-[#0b1007]" />
          </div>
          <div>
            <div className="font-bold leading-tight tracking-tight">Agent Server</div>
            <div className="mt-[3px] font-mono text-[10px] uppercase tracking-[0.08em] text-dim">
              Operator console
            </div>
          </div>
        </div>

        <nav aria-label="Main navigation" className="flex flex-col gap-1">
          <SidebarNavLink to="/" end icon={<span>⌁</span>}>
            Overview
          </SidebarNavLink>
          <SidebarNavLink to="/connect" icon={<span>↗</span>} badge="2">
            Connect
          </SidebarNavLink>
          <SidebarNavLink to="/workspaces" icon={<span>⌘</span>}>
            Workspaces
          </SidebarNavLink>
          <SidebarNavLink to="/devices" icon={<span>◇</span>}>
            Devices
          </SidebarNavLink>
          <SidebarNavLink to="/chat" icon={<span>›_</span>}>
            Test chat
          </SidebarNavLink>
        </nav>

        <div className="mt-auto">
          <div className="mb-2 rounded-lg border border-line-soft bg-[#0d1015] p-[11px]">
            <div className="flex items-center gap-[7px] text-[11px] text-[#bbc2cc]">
              <StatusDot variant={sidebarDotVariant(connectionPhase)} />
              <span>Local instance</span>
              {connectionPhase === "online" ? (
                <span className="ml-auto font-mono text-[8px] text-lime">LIVE</span>
              ) : null}
            </div>
            {instanceAddress ? (
              <code className="mt-[7px] ml-3.5 block font-mono text-[9px] text-dim">
                {instanceAddress}
              </code>
            ) : null}
          </div>
          <SidebarNavLink to="/settings" subtle icon={<span>⚙</span>}>
            Settings
          </SidebarNavLink>
          <div className="flex justify-between px-[9px] pt-[13px] font-mono text-[9px] text-[#414955]">
            <span>agent-server</span>
            <span>v0.8.4</span>
          </div>
        </div>
      </aside>

      <div className="min-h-screen ml-[224px] max-[820px]:ml-0">
        <header className="sticky top-0 z-30 flex h-[73px] items-center justify-between border-b border-line-soft bg-[rgba(8,10,13,0.89)] px-[34px] backdrop-blur-[18px] max-[820px]:justify-start max-[820px]:px-[18px]">
          <IconButton
            aria-label="Toggle navigation"
            className="mr-3 hidden max-[820px]:grid"
            onClick={toggleSidebar}
          >
            ☰
          </IconButton>
          <div>
            <div className="font-mono text-[9px] leading-tight tracking-[0.12em] text-[#667080]">
              {eyebrow}
            </div>
            <h1 className="m-0 mt-[3px] text-lg font-semibold tracking-tight">{title}</h1>
          </div>
          <div className="flex items-center gap-2 max-[820px]:ml-auto">
            <div
              className="flex h-8 items-center gap-[7px] rounded-[7px] border border-line px-2.5 text-[10px] text-muted max-[820px]:hidden"
              title="JSON Server API status"
            >
              <StatusDot variant={sidebarDotVariant(connectionPhase)} />
              <span>{topbarLabel(connectionPhase)}</span>
            </div>
            <IconButton aria-label="Refresh data" onClick={() => void refetch()}>
              ↻
            </IconButton>
            <Link
              to="/chat"
              onClick={closeSidebar}
              className="inline-flex min-h-9 items-center justify-center gap-3 rounded-[7px] border border-lime bg-lime px-3.5 text-[11px] font-semibold whitespace-nowrap text-lime-ink shadow-[0_0_0_1px_rgba(0,0,0,0.18),inset_0_1px_rgba(255,255,255,0.25)] hover:bg-lime-hover max-[640px]:hidden"
            >
              <span>Open test chat</span>
              <span aria-hidden>→</span>
            </Link>
          </div>
        </header>

        <div className="mx-auto max-w-[1550px] px-[35px] py-[35px] max-[820px]:px-[18px] max-[820px]:py-[25px] max-[640px]:px-[13px] max-[640px]:py-[22px]">
          <Outlet />
        </div>
      </div>
    </div>
  )
}
