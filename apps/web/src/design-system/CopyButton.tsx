import React, { useRef, useState } from "react"
import { createPortal } from "react-dom"
import { Button } from "./Button"

type CopyButtonProps = {
  value: string
  label?: string
  copiedLabel?: string
  disabled?: boolean
  className?: string
  size?: "md" | "sm" | "xs"
}

type CopiedTooltip = {
  top: number
  left: number
  playId: number
}

export const CopyButton: React.FC<CopyButtonProps> = ({
  value,
  label = "Copy",
  copiedLabel = "Copied",
  disabled = false,
  className = "",
  size = "sm",
}) => {
  const [tooltip, setTooltip] = useState<CopiedTooltip | null>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)

  const handleCopy = () => {
    if (value.length === 0 || disabled) {
      return
    }

    void navigator.clipboard.writeText(value).then(() => {
      const button = buttonRef.current
      if (button === null) {
        return
      }

      const rect = button.getBoundingClientRect()
      setTooltip((current) => ({
        top: rect.top - 8,
        left: rect.left + rect.width / 2,
        playId: (current?.playId ?? 0) + 1,
      }))
    })
  }

  return (
    <span className="relative inline-flex">
      <Button
        ref={buttonRef}
        variant="secondary"
        size={size}
        disabled={disabled || value.length === 0}
        className={className}
        onClick={handleCopy}
      >
        {label}
      </Button>
      {tooltip !== null
        ? createPortal(
            <span
              key={tooltip.playId}
              role="status"
              aria-live="polite"
              style={{ top: tooltip.top, left: tooltip.left }}
              className="copy-button-feedback"
              onAnimationEnd={() => {
                setTooltip((current) =>
                  current?.playId === tooltip.playId ? null : current,
                )
              }}
            >
              {copiedLabel}
              <span aria-hidden className="copy-button-feedback-caret" />
            </span>,
            document.body,
          )
        : null}
    </span>
  )
}
