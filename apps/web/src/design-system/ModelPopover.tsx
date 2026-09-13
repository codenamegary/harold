import React, { useMemo, useRef, useState } from "react"
import { ChevronDown } from "lucide-react"
import { ConfigOption, ConfigOptionValue } from "contracts/http/config.options"

const FILTER_INPUT_THRESHOLD = 20

export type ModelLinkProps = {
  option: ConfigOption
  onPick: () => void
  className?: string
  disabled?: boolean
}

export const ModelLink: React.FC<ModelLinkProps> = ({
  option,
  onPick,
  className = "",
  disabled = false,
}) => {
  if (option.type !== "select") {
    return null
  }

  const current = option.options.find((item) => item.value === option.currentValue)
  const label = current?.name ?? option.currentValue

  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onPick}
      aria-label={`Model: ${label}. Open the model list.`}
      className={`inline-flex max-w-[180px] items-center gap-0.5 rounded px-0.5 font-mono text-xs outline-none focus-visible:ring-1 focus-visible:ring-current disabled:cursor-not-allowed disabled:opacity-50 ${className}`}
    >
      <span className="truncate">{label}</span>
      <ChevronDown aria-hidden className="size-3 shrink-0" />
    </button>
  )
}

export type ModelPopoverProps = {
  open: boolean
  options: ReadonlyArray<ConfigOptionValue>
  currentValue: string
  onPick: (value: string) => void
  onClose: () => void
  className?: string
}

export const ModelPopover: React.FC<ModelPopoverProps> = ({
  open,
  options,
  currentValue,
  onPick,
  onClose,
  className = "",
}) => {
  const [query, setQuery] = useState("")
  const [highlighted, setHighlighted] = useState(0)
  const listRef = useRef<HTMLUListElement>(null)

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase()
    if (needle === "") {
      return options
    }
    return options.filter(
      (item) =>
        item.name.toLowerCase().includes(needle)
        || item.value.toLowerCase().includes(needle),
    )
  }, [options, query])

  if (!open) {
    return null
  }

  const currentIndex = filtered.findIndex((item) => item.value === currentValue)
  const effectiveHighlight = Math.min(Math.max(highlighted, 0), Math.max(filtered.length - 1, 0))

  const pick = (value: string) => {
    onPick(value)
    onClose()
  }

  const handleKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === "Escape") {
      event.preventDefault()
      onClose()
      return
    }
    if (event.key === "ArrowDown") {
      event.preventDefault()
      setHighlighted(Math.min(effectiveHighlight + 1, filtered.length - 1))
      return
    }
    if (event.key === "ArrowUp") {
      event.preventDefault()
      setHighlighted(Math.max(effectiveHighlight - 1, 0))
      return
    }
    if (event.key === "Enter") {
      event.preventDefault()
      const target =
        filtered[effectiveHighlight]
        ?? (currentIndex >= 0 ? filtered[currentIndex] : undefined)
        ?? filtered[0]
      if (target !== undefined) {
        pick(target.value)
      }
    }
  }

  return (
    <div
      className={`absolute bottom-full left-0 z-30 mb-2 w-[360px] max-w-full rounded-lg border border-line-modal bg-panel-elevated p-1.5 shadow-[0_12px_40px_rgba(0,0,0,0.45)] ${className}`}
      onKeyDown={handleKeyDown}
    >
      {options.length > FILTER_INPUT_THRESHOLD ? (
        <input
          type="text"
          autoFocus
          value={query}
          onChange={(event) => {
            setQuery(event.target.value)
            setHighlighted(0)
          }}
          placeholder="Filter models"
          aria-label="Filter models"
          className="mb-1.5 w-full rounded-md border border-line-input bg-surface-raised px-2.5 py-1.5 font-mono text-xs text-body outline-none placeholder:text-dim focus:border-lime"
        />
      ) : null}
      <ul
        ref={listRef}
        role="listbox"
        aria-label="Model options"
        tabIndex={-1}
        className="max-h-[280px] overflow-y-auto"
      >
        {filtered.map((item, index) => {
          const isCurrent = item.value === currentValue
          return (
            <li key={item.value}>
              <button
                type="button"
                role="option"
                aria-selected={isCurrent}
                onMouseEnter={() => setHighlighted(index)}
                onClick={() => pick(item.value)}
                className={`flex w-full flex-col items-start gap-0.5 rounded-md px-2.5 py-1.5 text-left text-xs ${
                  isCurrent
                    ? "bg-lime/10 text-lime"
                    : index === effectiveHighlight
                      ? "bg-hover-surface text-body"
                      : "text-body-soft"
                }`}
              >
                <span className="w-full truncate font-mono">{item.name}</span>
                {item.description !== undefined ? (
                  <span className="w-full truncate text-2xs text-dim">{item.description}</span>
                ) : (
                  <span className="w-full truncate text-2xs text-dim">{item.value}</span>
                )}
              </button>
            </li>
          )
        })}
        {filtered.length === 0 ? (
          <li className="px-2.5 py-2 text-xs text-dim">No models match.</li>
        ) : null}
      </ul>
    </div>
  )
}
