import React from "react"
import { AgentsPanel } from "../agent-settings/AgentsPanel"
import { ProviderPanel } from "./ProviderPanel"
import { RuntimePanel } from "./RuntimePanel"
import { ServerDetailsPanel } from "./ServerDetailsPanel"

export const SettingsView: React.FC = () => (
  <>
    <ProviderPanel />
    <AgentsPanel />
    <div className="grid gap-[25px] lg:grid-cols-2">
      <RuntimePanel />
      <ServerDetailsPanel />
    </div>
  </>
)
