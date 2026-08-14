import {
  Combobox as HeadlessCombobox,
  ComboboxButton,
  ComboboxInput,
  ComboboxOption,
  ComboboxOptions,
  Listbox,
  ListboxButton,
  ListboxOption,
  ListboxOptions,
} from "@headlessui/react"
import { ChevronDown } from "lucide-react"
import React, { useMemo, useState } from "react"
import { ConfirmDeleteIconButton } from "./ConfirmDeleteIconButton"

export type ComboboxOptionItem = {
  value: string
  label: string
  description?: string
  deletable?: boolean
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
  onOpen?: () => void
  onDeleteOption?: (value: string) => void
  deletingOptionValue?: string | null
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

type OptionRowProps = {
  option: ComboboxOptionItem
  onDeleteOption?: (value: string) => void
  deletingOptionValue: string | null
}

const OptionRow: React.FC<OptionRowProps> = ({
  option,
  onDeleteOption,
  deletingOptionValue,
}) => (
  <span className="flex items-start gap-2">
    <span className="min-w-0 flex-1">
      <span className="block truncate font-medium">{option.label}</span>
      {option.description !== undefined ? (
        <span className="mt-1 block truncate font-mono text-xs text-dim">
          {option.description}
        </span>
      ) : null}
    </span>
    {option.deletable === true && onDeleteOption !== undefined ? (
      <span
        className="shrink-0"
        onClick={(event) => {
          event.preventDefault()
          event.stopPropagation()
        }}
        onPointerDown={(event) => {
          event.preventDefault()
          event.stopPropagation()
        }}
      >
        <ConfirmDeleteIconButton
          aria-label={`Delete ${option.label}`}
          pending={deletingOptionValue === option.value}
          onConfirm={() => {
            onDeleteOption(option.value)
          }}
        />
      </span>
    ) : null}
  </span>
)

const optionItemClassName =
  "cursor-pointer px-3.5 py-2.5 text-sm text-body data-focus:bg-hover-surface data-focus:text-white data-selected:text-lime"

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
  onOpen,
  onDeleteOption,
  deletingOptionValue = null,
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

  if (variant === "title") {
    const displayLabel = selected?.label ?? placeholder
    const titleShellClassName = `relative min-w-[180px] max-w-full ${
      disabled ? "cursor-not-allowed opacity-50" : ""
    }`

    return (
      <div className={`flex min-w-0 items-center gap-2 ${className}`}>
        <Listbox
          value={selected}
          disabled={disabled}
          by="value"
          onChange={(option) => {
            if (option === null) {
              return
            }
            onChange(option.value)
          }}
        >
          <div className={titleShellClassName}>
            <ListboxButton
              aria-label={ariaLabel}
              className="flex min-w-0 max-w-full items-center gap-2 border-0 bg-transparent p-0 text-left outline-none"
              onClick={() => {
                onOpen?.()
              }}
            >
              <span className="min-w-0 flex-1 truncate text-base font-semibold text-white">
                {displayLabel}
              </span>
              <span
                aria-hidden
                className="grid size-8 shrink-0 place-items-center rounded text-dim"
              >
                <ChevronDown className="size-5 stroke-[2.25]" />
              </span>
            </ListboxButton>

            <ListboxOptions className="absolute top-full left-0 z-50 mt-1.5 max-h-60 min-w-[280px] w-max overflow-auto rounded-md border border-line bg-panel-elevated py-1.5 shadow-lg empty:invisible">
              {options.length === 0 ? (
                <div className="px-3.5 py-2.5 text-sm text-dim">{emptyMessage}</div>
              ) : (
                options.map((option) => (
                  <ListboxOption
                    key={option.value === "" ? "__empty" : option.value}
                    value={option}
                    className={optionItemClassName}
                  >
                    <OptionRow
                      option={option}
                      onDeleteOption={onDeleteOption}
                      deletingOptionValue={deletingOptionValue}
                    />
                  </ListboxOption>
                ))
              )}
            </ListboxOptions>
          </div>
        </Listbox>
        {trailing}
      </div>
    )
  }

  const shellClassName = `relative w-full min-h-10 rounded-md border border-line-input bg-surface-deep px-3 py-2 focus-within:border-lime/40 ${
    disabled ? "cursor-not-allowed opacity-50" : ""
  }`

  return (
    <div className={`flex min-w-0 w-full items-center gap-2 ${className}`}>
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
          {label !== undefined ? (
            <span className="mb-1.5 block font-mono text-2xs text-label">{label}</span>
          ) : null}
          <div className="flex items-center gap-1.5">
            <ComboboxInput
              aria-label={ariaLabel}
              displayValue={(option: ComboboxOptionItem | null) =>
                query === "" ? (option?.label ?? "") : query
              }
              onChange={(event) => handleQueryChange(event.target.value)}
              onFocus={() => {
                onOpen?.()
              }}
              placeholder={placeholder}
              className="block w-full min-w-0 border-0 bg-transparent p-0 text-sm text-input outline-none placeholder:text-dim"
            />
            <ComboboxButton
              aria-label={`Toggle ${ariaLabel} options`}
              className="grid size-7 shrink-0 place-items-center rounded border-0 bg-transparent p-0 text-dim hover:text-body"
              onClick={() => {
                onOpen?.()
              }}
            >
              <ChevronDown aria-hidden className="size-4 stroke-2" />
            </ComboboxButton>
          </div>

          <ComboboxOptions className="absolute top-full right-0 left-0 z-50 mt-1.5 max-h-60 w-full overflow-auto rounded-md border border-line bg-panel-elevated py-1.5 shadow-lg empty:invisible">
            {visibleOptions.length === 0 ? (
              <div className="px-3.5 py-2.5 text-sm text-dim">{emptyMessage}</div>
            ) : (
              visibleOptions.map((option) => (
                <ComboboxOption
                  key={option.value === "" ? "__empty" : option.value}
                  value={option}
                  className={optionItemClassName}
                >
                  <OptionRow
                    option={option}
                    onDeleteOption={onDeleteOption}
                    deletingOptionValue={deletingOptionValue}
                  />
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
