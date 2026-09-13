import React from "react"
import { ConfigOption, ConfigOptionValue } from "contracts/http/config-options"
import { ModelPicker } from "./ModelPicker"
import { ModeToggle } from "./ModeToggle"
import { ThinkingControl } from "./ThinkingControl"

export type SessionConfigRowProps = {
  model?: ConfigOption
  mode?: ConfigOption
  thinking?: ConfigOption
  onModelPick: (value: string) => void
  onModeCycle: (next: ConfigOptionValue) => void
  onThinkingCycle: (next: ConfigOptionValue) => void
  disabled?: boolean
}

/**
 * The composer toolbar's config controls: model link, mode cycle, effort
 * cycle. Renders whatever reserved options the agent returned — a missing
 * option just doesn't render.
 */
export const SessionConfigRow: React.FC<SessionConfigRowProps> = ({
  model,
  mode,
  thinking,
  onModelPick,
  onModeCycle,
  onThinkingCycle,
  disabled = false,
}) => {
  if (model === undefined && mode === undefined && thinking === undefined) {
    return null
  }

  return (
    <div className="pointer-events-auto flex min-w-0 items-center gap-2.5 text-[#77818e]">
      {model !== undefined ? (
        <ModelPicker option={model} onPick={onModelPick} disabled={disabled} />
      ) : null}
      {mode !== undefined ? (
        <ModeToggle option={mode} onCycle={onModeCycle} disabled={disabled} />
      ) : null}
      {thinking !== undefined ? (
        <ThinkingControl option={thinking} onCycle={onThinkingCycle} disabled={disabled} />
      ) : null}
    </div>
  )
}
