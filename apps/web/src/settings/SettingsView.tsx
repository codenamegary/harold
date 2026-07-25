import React from "react"
import { ProviderPanel } from "./ProviderPanel"
import { RuntimePanel } from "./RuntimePanel"
import { ServerDetailsPanel } from "./ServerDetailsPanel"
import { SettingsPageIntro } from "./SettingsPageIntro"

export const SettingsView: React.FC = () => (
  <>
    <SettingsPageIntro />
    <ProviderPanel />
    <div className="grid gap-[25px] lg:grid-cols-2">
      <RuntimePanel />
      <ServerDetailsPanel />
    </div>
  </>
)
