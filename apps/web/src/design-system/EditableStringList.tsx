import React, { FormEvent } from "react"
import { Plus, Trash2 } from "lucide-react"
import { IconButton } from "./IconButton"
import { TextInput } from "./TextInput"

type EditableStringListProps = {
  value: readonly string[]
  onChange: (next: string[]) => void
  disabled?: boolean
  "aria-label": string
}

export const EditableStringList: React.FC<EditableStringListProps> = ({
  value,
  onChange,
  disabled = false,
  "aria-label": ariaLabel,
}) => {
  const handleItemChange = (index: number, nextValue: string) => {
    onChange(value.map((item, itemIndex) => (itemIndex === index ? nextValue : item)))
  }

  const handleRemove = (index: number) => {
    onChange(value.filter((_, itemIndex) => itemIndex !== index))
  }

  const handleAdd = () => {
    onChange([...value, ""])
  }

  const handleRowSubmit = (index: number, event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    event.stopPropagation()

    if (index !== value.length - 1) {
      return
    }

    handleAdd()
  }

  return (
    <div className="flex flex-col gap-1.5" role="list" aria-label={ariaLabel}>
      {value.map((item, index) => (
        <form
          key={index}
          role="listitem"
          className="flex min-w-0 items-center gap-1.5"
          onSubmit={(event) => handleRowSubmit(index, event)}
        >
          <TextInput
            value={item}
            disabled={disabled}
            aria-label={`${ariaLabel} item ${index + 1}`}
            className="min-h-8 text-xs"
            onChange={(event) => handleItemChange(index, event.target.value)}
            onInput={(event) => handleItemChange(index, event.currentTarget.value)}
          />
          <IconButton
            aria-label={`Remove ${ariaLabel} item ${index + 1}`}
            disabled={disabled}
            className="shrink-0"
            onClick={() => handleRemove(index)}
          >
            <Trash2 aria-hidden className="size-3.5" strokeWidth={1.75} />
          </IconButton>
        </form>
      ))}
      <button
        type="button"
        disabled={disabled}
        aria-label={`Add ${ariaLabel} item`}
        className="inline-flex min-h-6 w-fit items-center gap-1 rounded-[7px] bg-transparent px-0 text-2xs font-semibold text-body-soft transition-opacity duration-300 ease-out hover:text-lime cursor-pointer disabled:cursor-not-allowed disabled:pointer-events-none disabled:opacity-50"
        onClick={handleAdd}
      >
        <Plus aria-hidden className="size-3" strokeWidth={2} />
        Add item
      </button>
    </div>
  )
}
