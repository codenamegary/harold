import React, { useState } from "react"
import { ConfigOption } from "contracts/http/config.options"
import { ModelLink, ModelPopover } from "../../design-system/ModelPopover"

export const ModelPicker: React.FC<{
  option: ConfigOption
  onPick: (value: string) => void
  disabled?: boolean
}> = ({ option, onPick, disabled = false }) => {
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
        onPick={() => setOpen(true)}
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
