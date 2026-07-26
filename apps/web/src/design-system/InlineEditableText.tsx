import React, { KeyboardEvent, useRef, useState } from "react"
import { TextInput } from "./TextInput"

type InlineEditableTextProps = {
  value: string
  onSave: (newValue: string) => void | Promise<void>
  onCancel: () => void
  onEditingChange?: (isEditing: boolean) => void
  isSaving: boolean
  error?: string
  ariaLabel: string
}

export const InlineEditableText: React.FC<InlineEditableTextProps> = ({
  value,
  onSave,
  onCancel,
  onEditingChange,
  isSaving,
  error,
  ariaLabel,
}) => {
  const [isEditing, setIsEditing] = useState(false)
  const [draft, setDraft] = useState(value)
  const inputRef = useRef<HTMLInputElement>(null)

  const setEditing = (editing: boolean) => {
    setIsEditing(editing)
    onEditingChange?.(editing)
  }

  const startEditing = () => {
    if (isSaving) {
      return
    }

    setDraft(value)
    setEditing(true)
  }

  const cancelEditing = () => {
    setDraft(value)
    setEditing(false)
    onCancel()
  }

  const saveEditing = async () => {
    const nextValue = (inputRef.current?.value ?? draft).trim()

    if (nextValue === "" || nextValue === value) {
      cancelEditing()
      return
    }

    try {
      await onSave(nextValue)
      setEditing(false)
    } catch {
      // Parent sets error and keeps edit mode open.
    }
  }

  const handleBlur = () => {
    if (isSaving) {
      return
    }

    cancelEditing()
  }

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter") {
      event.preventDefault()
      void saveEditing()
    }

    if (event.key === "Escape") {
      event.preventDefault()
      cancelEditing()
    }
  }

  if (!isEditing) {
    return (
      <button
        type="button"
        className="m-0 min-h-5 cursor-text border-0 bg-transparent p-0 text-left text-sm font-semibold leading-5 text-white hover:text-lime"
        aria-label={ariaLabel}
        onClick={startEditing}
      >
        {value}
      </button>
    )
  }

  return (
    <div className="min-w-0 flex-1">
      <form
        onSubmit={(event) => {
          event.preventDefault()
          void saveEditing()
        }}
      >
        <div className="relative">
          <TextInput
            ref={inputRef}
            aria-label={ariaLabel}
            autoFocus
            className="pr-9"
            disabled={isSaving}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={handleKeyDown}
            onBlur={handleBlur}
          />
          <button
            type="button"
            aria-label="Cancel rename"
            className="absolute top-1/2 right-2 grid size-6 -translate-y-1/2 place-items-center rounded text-dim hover:text-white"
            disabled={isSaving}
            onMouseDown={(event) => event.preventDefault()}
            onClick={cancelEditing}
          >
            ×
          </button>
        </div>
      </form>
      {error ? (
        <p className="mt-2 text-xs text-red-400" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  )
}
