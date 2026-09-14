import React, { useState } from "react"
import { ConfigOption } from "contracts/http/config.options"
import { ModelLink, ModelPopover } from "../../design-system/ModelPopover"

export const ModelPicker: React.FC<{
  option: ConfigOption
  onPick: (value: string) => void
  saving?: boolean
  disabled?: boolean
}> = ({ option, onPick, saving = false, disabled = false }) => {
  const [open, setOpen] = useState(false)

  if (option.type !== "select") {
    return null
  }

  const handlePick = (value: string) => {
    setOpen(false)
    onPick(value)
  }

  return (
    <div className="relative">
      <ModelLink
        option={option}
        onPick={() => setOpen((current) => !current)}
        saving={saving}
        disabled={disabled}
      />
      <ModelPopover
        open={open}
        options={option.options}
        currentValue={option.currentValue}
        onPick={handlePick}
        onClose={() => setOpen(false)}
      />
    </div>
  )
}
