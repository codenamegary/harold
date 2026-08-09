import React, { FormEvent } from "react"
import {
  closestCenter,
  DndContext,
  DragEndEvent,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core"
import {
  arrayMove,
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
import { GripVertical, Plus, Trash2 } from "lucide-react"
import { IconButton } from "./IconButton"
import { TextInput } from "./TextInput"

type EditableStringListProps = {
  value: readonly string[]
  onChange: (next: string[]) => void
  disabled?: boolean
  sortable?: boolean
  "aria-label": string
}

export const moveEditableStringListItem = (
  value: readonly string[],
  fromIndex: number,
  toIndex: number,
): string[] => {
  if (
    fromIndex === toIndex ||
    fromIndex < 0 ||
    toIndex < 0 ||
    fromIndex >= value.length ||
    toIndex >= value.length
  ) {
    return [...value]
  }

  return arrayMove([...value], fromIndex, toIndex)
}

type RowFieldsProps = {
  index: number
  item: string
  ariaLabel: string
  disabled: boolean
  onItemChange: (index: number, nextValue: string) => void
  onRemove: (index: number) => void
}

const RowFields: React.FC<RowFieldsProps> = ({
  index,
  item,
  ariaLabel,
  disabled,
  onItemChange,
  onRemove,
}) => (
  <>
    <TextInput
      value={item}
      disabled={disabled}
      aria-label={`${ariaLabel} item ${index + 1}`}
      className="min-h-8 text-xs"
      onChange={(event) => onItemChange(index, event.target.value)}
      onInput={(event) => onItemChange(index, event.currentTarget.value)}
    />
    <IconButton
      aria-label={`Remove ${ariaLabel} item ${index + 1}`}
      disabled={disabled}
      className="shrink-0"
      onClick={() => onRemove(index)}
    >
      <Trash2 aria-hidden className="size-3.5" strokeWidth={1.75} />
    </IconButton>
  </>
)

type StaticRowProps = RowFieldsProps & {
  onRowSubmit: (index: number, event: FormEvent<HTMLFormElement>) => void
}

const StaticRow: React.FC<StaticRowProps> = ({
  index,
  item,
  ariaLabel,
  disabled,
  onItemChange,
  onRemove,
  onRowSubmit,
}) => (
  <form
    role="listitem"
    className="flex min-w-0 items-center gap-1.5"
    onSubmit={(event) => onRowSubmit(index, event)}
  >
    <RowFields
      index={index}
      item={item}
      ariaLabel={ariaLabel}
      disabled={disabled}
      onItemChange={onItemChange}
      onRemove={onRemove}
    />
  </form>
)

type SortableRowProps = StaticRowProps & {
  id: string
}

const SortableRow: React.FC<SortableRowProps> = ({
  id,
  index,
  item,
  ariaLabel,
  disabled,
  onItemChange,
  onRemove,
  onRowSubmit,
}) => {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id,
    disabled,
  })

  return (
    <form
      ref={setNodeRef}
      role="listitem"
      className={`flex min-w-0 items-center gap-1.5 ${isDragging ? "opacity-70" : ""}`}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
      }}
      onSubmit={(event) => onRowSubmit(index, event)}
    >
      <button
        type="button"
        aria-label={`Reorder ${ariaLabel} item ${index + 1}`}
        disabled={disabled}
        className="grid size-[34px] shrink-0 place-items-center rounded-[7px] border border-line bg-surface text-icon cursor-grab active:cursor-grabbing hover:border-line-hover hover:bg-hover-surface hover:text-slate-200 disabled:cursor-not-allowed disabled:pointer-events-none disabled:opacity-50"
        {...attributes}
        {...listeners}
      >
        <GripVertical aria-hidden className="size-3.5" strokeWidth={1.75} />
      </button>
      <RowFields
        index={index}
        item={item}
        ariaLabel={ariaLabel}
        disabled={disabled}
        onItemChange={onItemChange}
        onRemove={onRemove}
      />
    </form>
  )
}

export const EditableStringList: React.FC<EditableStringListProps> = ({
  value,
  onChange,
  disabled = false,
  sortable = false,
  "aria-label": ariaLabel,
}) => {
  const itemIds = value.map((_, index) => String(index))
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 6,
      },
    }),
  )

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

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event
    if (over === null || active.id === over.id) {
      return
    }

    const fromIndex = Number(active.id)
    const toIndex = Number(over.id)
    onChange(moveEditableStringListItem(value, fromIndex, toIndex))
  }

  const listBody = sortable ? (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <SortableContext items={itemIds} strategy={verticalListSortingStrategy}>
        {value.map((item, index) => {
          const id = String(index)
          return (
            <SortableRow
              key={id}
              id={id}
              index={index}
              item={item}
              ariaLabel={ariaLabel}
              disabled={disabled}
              onItemChange={handleItemChange}
              onRemove={handleRemove}
              onRowSubmit={handleRowSubmit}
            />
          )
        })}
      </SortableContext>
    </DndContext>
  ) : (
    value.map((item, index) => (
      <StaticRow
        key={itemIds[index]}
        index={index}
        item={item}
        ariaLabel={ariaLabel}
        disabled={disabled}
        onItemChange={handleItemChange}
        onRemove={handleRemove}
        onRowSubmit={handleRowSubmit}
      />
    ))
  )

  return (
    <div className="flex flex-col gap-1.5" role="list" aria-label={ariaLabel}>
      {listBody}
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
