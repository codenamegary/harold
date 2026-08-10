import { arrayMove } from "@dnd-kit/sortable"

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
