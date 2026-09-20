import React from "react"
import { StreamPermission } from "./parse.permission"

type PermissionPanelProps = {
  request: StreamPermission
  onSelectOption: (optionId: string) => void
}

export const PermissionPanel: React.FC<PermissionPanelProps> = ({ request, onSelectOption }) => (
  <div className="mb-3 rounded-lg border border-amber/25 bg-amber/5 px-4 py-3">
    <p className="mb-2 text-base text-body">
      Permission required for <span className="font-mono text-body-soft">{request.toolName}</span>
    </p>
    <div className="flex flex-wrap gap-2">
      {request.options.map((option) => (
        <button
          key={option.optionId}
          type="button"
          onClick={() => onSelectOption(option.optionId)}
          className="rounded-md border border-amber/35 bg-amber/10 px-3 py-1.5 text-sm text-body hover:bg-amber/15 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {option.name}
        </button>
      ))}
    </div>
  </div>
)
