import React, { useEffect, useRef, useState } from "react"
import { Trash2 } from "lucide-react"
import { Button } from "./Button"

type ConfirmDeleteSize = "xs" | "sm"

type ConfirmDeleteIconButtonProps = {
  "aria-label": string
  onConfirm: () => void
  disabled?: boolean
  confirmLabel?: string
  cancelLabel?: string
  size?: ConfirmDeleteSize
  className?: string
}

const sizeStyles: Record<
  ConfirmDeleteSize,
  {
    root: string
    trashIdleMax: string
    trashButton: string
    trashIcon: string
    actionsOpenMax: string
    buttonSize: "xs" | "sm"
  }
> = {
  xs: {
    root: "h-6",
    trashIdleMax: "max-w-6",
    trashButton: "size-6",
    trashIcon: "size-3.5",
    actionsOpenMax: "max-w-40",
    buttonSize: "xs",
  },
  sm: {
    root: "h-7",
    trashIdleMax: "max-w-7",
    trashButton: "size-7",
    trashIcon: "size-3.5",
    actionsOpenMax: "max-w-44",
    buttonSize: "sm",
  },
}

export const ConfirmDeleteIconButton: React.FC<ConfirmDeleteIconButtonProps> = ({
  "aria-label": ariaLabel,
  onConfirm,
  disabled = false,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  size = "xs",
  className = "",
}) => {
  const [confirming, setConfirming] = useState(false)
  const confirmButtonRef = useRef<HTMLButtonElement>(null)
  const styles = sizeStyles[size]

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
      className={`inline-flex items-stretch justify-end overflow-hidden ${styles.root} ${className}`}
      data-confirming={confirming ? "true" : "false"}
      data-size={size}
    >
      <div
        className={`flex shrink-0 items-stretch justify-center overflow-hidden transition-[max-width,opacity,transform] duration-200 ease-out ${
          confirming
            ? "max-w-0 translate-x-3 opacity-0 pointer-events-none"
            : `${styles.trashIdleMax} translate-x-0 opacity-100`
        }`}
        aria-hidden={confirming}
      >
        <button
          type="button"
          aria-label={ariaLabel}
          disabled={disabled || confirming}
          className={`grid ${styles.trashButton} place-items-center rounded text-dim transition-colors hover:text-danger cursor-pointer disabled:cursor-not-allowed disabled:opacity-50`}
          onClick={() => setConfirming(true)}
        >
          <Trash2 aria-hidden className={styles.trashIcon} strokeWidth={1.75} />
        </button>
      </div>

      <div
        className={`flex shrink-0 items-stretch gap-1 overflow-hidden transition-[max-width,opacity,transform] duration-200 ease-out ${
          confirming
            ? `${styles.actionsOpenMax} translate-x-0 opacity-100`
            : "max-w-0 -translate-x-2 opacity-0 pointer-events-none"
        }`}
        aria-hidden={!confirming}
      >
        <Button
          ref={confirmButtonRef}
          type="button"
          variant="danger"
          size={styles.buttonSize}
          className="h-full"
          disabled={disabled}
          onClick={handleConfirm}
        >
          {confirmLabel}
        </Button>
        <Button
          type="button"
          variant="secondary"
          size={styles.buttonSize}
          className="h-full"
          disabled={disabled}
          onClick={() => setConfirming(false)}
        >
          {cancelLabel}
        </Button>
      </div>
    </div>
  )
}
