import React, { FormEvent, useLayoutEffect, useState } from "react"
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
import { moveEditableStringListItem } from "./editable.string.list.move"
import { TextInput } from "./TextInput"

type EditableStringListProps = {
  value: readonly string[]
  onChange: (next: string[]) => void
  disabled?: boolean
  sortable?: boolean
  "aria-label": string
}

const createRowId = (): string => crypto.randomUUID()

const rowControlClassName =
  "grid size-8 shrink-0 place-items-center rounded-[7px] border border-line bg-surface text-icon hover:border-line-hover hover:bg-hover-surface hover:text-slate-200 disabled:cursor-not-allowed disabled:pointer-events-none disabled:opacity-50"

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
      className="h-8 min-h-8 text-xs"
      style={{ minHeight: "2rem", height: "2rem" }}
      onChange={(event) => onItemChange(index, event.target.value)}
      onInput={(event) => onItemChange(index, event.currentTarget.value)}
    />
    <button
      type="button"
      aria-label={`Remove ${ariaLabel} item ${index + 1}`}
      disabled={disabled}
      className={`${rowControlClassName} cursor-pointer`}
      onClick={() => onRemove(index)}
    >
      <Trash2 aria-hidden className="size-3.5" strokeWidth={1.75} />
    </button>
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
      className={`flex min-w-0 items-center gap-1.5 ${isDragging ? "z-10 opacity-70" : ""}`}
      style={{
        transform: CSS.Translate.toString(transform),
        transition,
      }}
      onSubmit={(event) => onRowSubmit(index, event)}
    >
      <button
        type="button"
        aria-label={`Reorder ${ariaLabel} item ${index + 1}`}
        disabled={disabled}
        className={`${rowControlClassName} cursor-grab active:cursor-grabbing`}
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

const syncItemIds = (previousIds: readonly string[], length: number): string[] => {
  if (previousIds.length === length) {
    return [...previousIds]
  }

  if (length > previousIds.length) {
    const extras = Array.from({ length: length - previousIds.length }, () => createRowId())
    return [...previousIds, ...extras]
  }

  return previousIds.slice(0, length)
}

export const EditableStringList: React.FC<EditableStringListProps> = ({
  value,
  onChange,
  disabled = false,
  sortable = false,
  "aria-label": ariaLabel,
}) => {
  const [itemIds, setItemIds] = useState<string[]>(() => value.map(() => createRowId()))

  useLayoutEffect(() => {
    setItemIds((previousIds) => {
      const nextIds = syncItemIds(previousIds, value.length)
      if (
        nextIds.length === previousIds.length &&
        nextIds.every((id, index) => id === previousIds[index])
      ) {
        return previousIds
      }
      return nextIds
    })
  }, [value.length])

  const resolvedIds =
    itemIds.length === value.length ? itemIds : syncItemIds(itemIds, value.length)

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
    setItemIds((previousIds) => previousIds.filter((_, itemIndex) => itemIndex !== index))
    onChange(value.filter((_, itemIndex) => itemIndex !== index))
  }

  const handleAdd = () => {
    setItemIds((previousIds) => [...previousIds, createRowId()])
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

    const fromIndex = resolvedIds.indexOf(String(active.id))
    const toIndex = resolvedIds.indexOf(String(over.id))
    if (fromIndex < 0 || toIndex < 0) {
      return
    }

    setItemIds(arrayMove(resolvedIds, fromIndex, toIndex))
    onChange(moveEditableStringListItem(value, fromIndex, toIndex))
  }

  const listBody = sortable ? (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <SortableContext items={resolvedIds} strategy={verticalListSortingStrategy}>
        {value.map((item, index) => {
          const id = resolvedIds[index]
          if (id === undefined) {
            return null
          }

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
    value.map((item, index) => {
      const id = resolvedIds[index] ?? `static-${index}`
      return (
        <StaticRow
          key={id}
          index={index}
          item={item}
          ariaLabel={ariaLabel}
          disabled={disabled}
          onItemChange={handleItemChange}
          onRemove={handleRemove}
          onRowSubmit={handleRowSubmit}
        />
      )
    })
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
