import React from "react"
import { StreamPermission } from "../permission/parse.stream.permission"

type PermissionPanelProps = {
  request: StreamPermission
  submittingOptionId: string | null
  onSelectOption: (optionId: string) => void
}

export const PermissionPanel: React.FC<PermissionPanelProps> = ({
  request,
  submittingOptionId,
  onSelectOption,
}) => (
  <div className="mb-3 rounded-[9px] border border-[#3a3220] bg-[#17130d] px-4 py-3">
    <p className="mb-2 text-sm text-body">
      Permission required for <span className="font-mono text-body-soft">{request.toolName}</span>
    </p>
    <div className="flex flex-wrap gap-2">
      {request.options.map((option) => (
        <button
          key={option.optionId}
          type="button"
          disabled={submittingOptionId !== null}
          onClick={() => onSelectOption(option.optionId)}
          className="rounded-md border border-[#4a4030] bg-[#221c14] px-3 py-1.5 text-sm text-body hover:bg-[#2b2419] disabled:cursor-not-allowed disabled:opacity-50"
        >
          {submittingOptionId === option.optionId ? "Submitting…" : option.name}
        </button>
      ))}
    </div>
  </div>
)
