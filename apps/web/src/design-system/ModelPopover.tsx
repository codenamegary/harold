import React, { useEffect, useMemo, useRef, useState } from "react"
import { ChevronDown, X } from "lucide-react"
import { ConfigOption, ConfigOptionValue } from "contracts/http/config.options"

const FILTER_INPUT_THRESHOLD = 20

const pinCurrentFirst = (
  allItems: ReadonlyArray<ConfigOptionValue>,
  matches: ReadonlyArray<ConfigOptionValue>,
  currentValue: string,
): ReadonlyArray<ConfigOptionValue> => {
  // Pull the current option from the full list so it stays visible even when
  // an active filter would otherwise exclude it, then pin it to the top.
  const current = allItems.find((item) => item.value === currentValue)
  if (current === undefined) {
    return matches
  }
  return [current, ...matches.filter((item) => item.value !== currentValue)]
}

export type ModelLinkProps = {
  option: ConfigOption
  onPick: () => void
  className?: string
  saving?: boolean
  disabled?: boolean
}

export const ModelLink: React.FC<ModelLinkProps> = ({
  option,
  onPick,
  className = "",
  saving = false,
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
      aria-label={`Model: ${label}. Toggle the model list.`}
      className={`inline-flex shrink-0 cursor-pointer items-center justify-between gap-0.5 rounded px-0.5 font-mono text-xs outline-none focus-visible:ring-1 focus-visible:ring-current disabled:cursor-not-allowed disabled:opacity-50 ${className}`}
    >
      {/* The saving sheen rides on the label span only, so the sweep stays
          over the text and leaves the ChevronDown out of it. */}
      <span className={`truncate${saving ? " config-saving-label" : ""}`}>{label}</span>
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
    const matches =
      needle === ""
        ? options
        : options.filter(
            (item) =>
              item.name.toLowerCase().includes(needle) || item.value.toLowerCase().includes(needle),
          )

    // Always surface the currently selected option at the top of the list,
    // even when a filter is active and would otherwise exclude it.
    return pinCurrentFirst(options, matches, currentValue)
  }, [options, query, currentValue])

  useEffect(() => {
    if (!open) {
      return
    }

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault()
        onClose()
      }
    }

    document.addEventListener("keydown", handleEscape)
    return () => {
      document.removeEventListener("keydown", handleEscape)
    }
  }, [open, onClose])

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
        filtered[effectiveHighlight] ??
        (currentIndex >= 0 ? filtered[currentIndex] : undefined) ??
        filtered[0]
      if (target !== undefined) {
        pick(target.value)
      }
    }
  }

  return (
    <div
      className={`absolute bottom-full left-0 z-30 mb-2 rounded-lg border border-line-modal bg-panel-elevated p-1.5 shadow-popover ${className}`}
      onKeyDown={handleKeyDown}
    >
      <div className="mb-1 flex items-center justify-end">
        <button
          type="button"
          aria-label="Close model list"
          onClick={onClose}
          className="grid size-4 cursor-pointer place-items-center rounded text-dim hover:text-body"
        >
          <X aria-hidden className="size-3.5" />
        </button>
      </div>
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
        className="max-h-70 overflow-y-auto"
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
                {typeof item.description === "string" ? (
                  <span className="w-full truncate text-xs text-dim">{item.description}</span>
                ) : (
                  <span className="w-full truncate text-xs text-dim">{item.value}</span>
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
