import {
  Combobox as HeadlessCombobox,
  ComboboxButton,
  ComboboxInput,
  ComboboxOption,
  ComboboxOptions,
} from "@headlessui/react"
import { ChevronDown } from "lucide-react"
import React, { useMemo, useState } from "react"

export type ComboboxOptionItem = {
  value: string
  label: string
  description?: string
}

type ComboboxFilter = "client" | "external"
type ComboboxVariant = "field" | "title"

type ComboboxProps = {
  label?: string
  "aria-label": string
  value: string
  onChange: (value: string) => void
  options: ReadonlyArray<ComboboxOptionItem>
  placeholder?: string
  disabled?: boolean
  emptyMessage?: string
  filter?: ComboboxFilter
  onQueryChange?: (query: string) => void
  className?: string
  trailing?: React.ReactNode
  variant?: ComboboxVariant
}

const matchesQuery = (option: ComboboxOptionItem, query: string) => {
  const normalized = query.trim().toLowerCase()
  if (normalized === "") {
    return true
  }

  const haystack = `${option.label} ${option.description ?? ""}`.toLowerCase()
  return haystack.includes(normalized)
}

export const Combobox: React.FC<ComboboxProps> = ({
  label,
  "aria-label": ariaLabel,
  value,
  onChange,
  options,
  placeholder = "Select…",
  disabled = false,
  emptyMessage = "No matches",
  filter = "client",
  onQueryChange,
  className = "",
  trailing,
  variant = "field",
}) => {
  const [query, setQuery] = useState("")

  const selected = options.find((option) => option.value === value) ?? null

  const visibleOptions = useMemo(() => {
    if (filter === "external") {
      return options
    }
    return options.filter((option) => matchesQuery(option, query))
  }, [filter, options, query])

  const handleQueryChange = (nextQuery: string) => {
    setQuery(nextQuery)
    onQueryChange?.(nextQuery)
  }

  const isTitle = variant === "title"
  const shellClassName = isTitle
    ? `relative min-w-[180px] max-w-full ${disabled ? "cursor-not-allowed opacity-50" : ""}`
    : `relative w-full min-h-10 rounded-md border border-line-input bg-surface-deep px-3 py-2 focus-within:border-lime/40 ${
        disabled ? "cursor-not-allowed opacity-50" : ""
      }`
  const inputClassName = isTitle
    ? "block w-full min-w-0 border-0 bg-transparent p-0 text-base font-semibold text-white outline-none placeholder:text-dim"
    : "block w-full min-w-0 border-0 bg-transparent p-0 text-sm text-input outline-none placeholder:text-dim"
  const optionsClassName = isTitle
    ? "absolute top-full left-0 z-50 mt-1.5 max-h-60 min-w-[280px] w-max overflow-auto rounded-md border border-line bg-panel-elevated py-1.5 shadow-lg empty:invisible"
    : "absolute top-full right-0 left-0 z-50 mt-1.5 max-h-60 w-full overflow-auto rounded-md border border-line bg-panel-elevated py-1.5 shadow-lg empty:invisible"
  const toggleButtonClassName = isTitle
    ? "grid size-8 shrink-0 place-items-center rounded border-0 bg-transparent p-0 text-dim hover:text-body"
    : "grid size-7 shrink-0 place-items-center rounded border-0 bg-transparent p-0 text-dim hover:text-body"
  const chevronClassName = isTitle ? "size-5 stroke-[2.25]" : "size-4 stroke-2"

  return (
    <div className={`flex min-w-0 items-center gap-2 ${isTitle ? "" : "w-full"} ${className}`}>
      <HeadlessCombobox
        value={selected}
        disabled={disabled}
        immediate
        by="value"
        onChange={(option) => {
          if (option === null) {
            return
          }
          setQuery("")
          onQueryChange?.("")
          onChange(option.value)
        }}
        onClose={() => {
          setQuery("")
          onQueryChange?.("")
        }}
      >
        <div className={shellClassName}>
          {label !== undefined && !isTitle ? (
            <span className="mb-1.5 block font-mono text-2xs text-label">{label}</span>
          ) : null}
          <div className={`flex items-center ${isTitle ? "gap-2" : "gap-1.5"}`}>
            <ComboboxInput
              aria-label={ariaLabel}
              displayValue={(option: ComboboxOptionItem | null) =>
                query === "" ? (option?.label ?? "") : query
              }
              onChange={(event) => handleQueryChange(event.target.value)}
              placeholder={placeholder}
              className={inputClassName}
            />
            <ComboboxButton
              aria-label={`Toggle ${ariaLabel} options`}
              className={toggleButtonClassName}
            >
              <ChevronDown aria-hidden className={chevronClassName} />
            </ComboboxButton>
          </div>

          <ComboboxOptions className={optionsClassName}>
            {visibleOptions.length === 0 ? (
              <div className="px-3.5 py-2.5 text-sm text-dim">{emptyMessage}</div>
            ) : (
              visibleOptions.map((option) => (
                <ComboboxOption
                  key={option.value === "" ? "__empty" : option.value}
                  value={option}
                  className="cursor-pointer px-3.5 py-2.5 text-sm text-body data-focus:bg-hover-surface data-focus:text-white data-selected:text-lime"
                >
                  <span className="block truncate font-medium">{option.label}</span>
                  {option.description !== undefined ? (
                    <span className="mt-1 block truncate font-mono text-xs text-dim">
                      {option.description}
                    </span>
                  ) : null}
                </ComboboxOption>
              ))
            )}
          </ComboboxOptions>
        </div>
      </HeadlessCombobox>
      {trailing}
    </div>
  )
}
