import React, { useEffect, useRef, useState } from "react"
import { Trash2 } from "lucide-react"
import { Button } from "./Button"

type ConfirmDeleteIconButtonProps = {
  "aria-label": string
  onConfirm: () => void
  disabled?: boolean
  confirmLabel?: string
  cancelLabel?: string
  className?: string
}

export const ConfirmDeleteIconButton: React.FC<ConfirmDeleteIconButtonProps> = ({
  "aria-label": ariaLabel,
  onConfirm,
  disabled = false,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  className = "",
}) => {
  const [confirming, setConfirming] = useState(false)
  const confirmButtonRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!confirming) {
      return
    }

    confirmButtonRef.current?.focus()
  }, [confirming])

  useEffect(() => {
    if (!confirming) {
      return
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault()
        setConfirming(false)
      }
    }

    window.addEventListener("keydown", onKeyDown)
    return () => {
      window.removeEventListener("keydown", onKeyDown)
    }
  }, [confirming])

  const handleConfirm = () => {
    setConfirming(false)
    onConfirm()
  }

  return (
    <div
      className={`inline-flex h-6 items-center justify-end overflow-hidden ${className}`}
      data-confirming={confirming ? "true" : "false"}
    >
      <div
        className={`flex shrink-0 items-center justify-center overflow-hidden transition-[max-width,opacity,transform] duration-200 ease-out ${
          confirming
            ? "max-w-0 translate-x-3 opacity-0 pointer-events-none"
            : "max-w-6 translate-x-0 opacity-100"
        }`}
        aria-hidden={confirming}
      >
        <button
          type="button"
          aria-label={ariaLabel}
          disabled={disabled || confirming}
          className="grid size-6 place-items-center rounded text-dim transition-colors hover:text-danger cursor-pointer disabled:cursor-not-allowed disabled:opacity-50"
          onClick={() => setConfirming(true)}
        >
          <Trash2 aria-hidden className="size-3.5" strokeWidth={1.75} />
        </button>
      </div>

      <div
        className={`flex shrink-0 items-center gap-1 overflow-hidden transition-[max-width,opacity,transform] duration-200 ease-out ${
          confirming
            ? "max-w-40 translate-x-0 opacity-100"
            : "max-w-0 -translate-x-2 opacity-0 pointer-events-none"
        }`}
        aria-hidden={!confirming}
      >
        <Button
          ref={confirmButtonRef}
          type="button"
          variant="danger"
          size="sm"
          className="min-h-6 px-2 text-2xs"
          disabled={disabled}
          onClick={handleConfirm}
        >
          {confirmLabel}
        </Button>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          className="min-h-6 px-2 text-2xs"
          disabled={disabled}
          onClick={() => setConfirming(false)}
        >
          {cancelLabel}
        </Button>
      </div>
    </div>
  )
}
