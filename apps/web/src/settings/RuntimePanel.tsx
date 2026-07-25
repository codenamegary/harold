import React from "react"
import { Panel } from "../design-system/Panel"

type RuntimeToggleProps = {
  label: string
  description: string
}

const RuntimeToggle: React.FC<RuntimeToggleProps> = ({ label, description }) => (
  <label className="flex items-center justify-between gap-4 border-t border-line-soft py-4 first:border-t-0 first:pt-0">
    <span>
      <strong className="block text-sm font-medium">{label}</strong>
      <small className="mt-1 block text-xs text-muted">{description}</small>
    </span>
    <input
      type="checkbox"
      disabled
      aria-label={label}
      className="size-4 shrink-0 cursor-not-allowed opacity-50"
    />
  </label>
)

export const RuntimePanel: React.FC = () => (
  <Panel className="p-[22px]">
    <h3 className="m-0 mb-1 text-lg font-semibold">Runtime</h3>
    <RuntimeToggle
      label="Allow local network"
      description="Accept clients from trusted LAN addresses"
    />
    <RuntimeToggle
      label="Detailed request logs"
      description="Record prompt metadata for debugging"
    />
  </Panel>
)
