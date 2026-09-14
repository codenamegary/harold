import React from "react"
import { ConfigOption, ConfigOptionValue } from "contracts/http/config.options"
import { ModelPicker } from "./ModelPicker"
import { ModeToggle } from "./ModeToggle"
import { ThinkingControl } from "./ThinkingControl"

export type SessionConfigRowProps = {
  model?: ConfigOption
  mode?: ConfigOption
  thinking?: ConfigOption
  saving?: boolean
  onModelPick: (value: string) => void
  onModeCycle: (next: ConfigOptionValue) => void
  onThinkingCycle: (next: ConfigOptionValue) => void
  disabled?: boolean
}

/**
 * The composer toolbar's config controls: model link, mode cycle, effort
 * cycle. Renders whatever reserved options the agent returned — a missing
 * option just doesn't render. With no options at all it shows a non-
 * interactive ghost row so the toolbar layout stays stable until the
 * session_config frame lands. `saving` shimmers the labels while a config
 * set is in flight.
 */
export const SessionConfigRow: React.FC<SessionConfigRowProps> = ({
  model,
  mode,
  thinking,
  saving = false,
  onModelPick,
  onModeCycle,
  onThinkingCycle,
  disabled = false,
}) => {
  if (model === undefined && mode === undefined && thinking === undefined) {
    return (
      <div
        className="pointer-events-none flex min-w-0 select-none items-center gap-2.5 font-mono text-xs text-dim"
        aria-hidden
      >
        <span className="truncate">provider/model</span>
        <span className="w-[50px] truncate">mode</span>
        <span className="truncate">thinking</span>
      </div>
    )
  }

  return (
    <div className="pointer-events-auto flex min-w-0 items-center gap-2.5 text-[#77818e]">
      {model !== undefined ? (
        <ModelPicker option={model} onPick={onModelPick} saving={saving} disabled={disabled} />
      ) : null}
      {mode !== undefined ? (
        <ModeToggle option={mode} onCycle={onModeCycle} saving={saving} disabled={disabled} />
      ) : null}
      {thinking !== undefined ? (
        <ThinkingControl
          option={thinking}
          onCycle={onThinkingCycle}
          saving={saving}
          disabled={disabled}
        />
      ) : null}
    </div>
  )
}
