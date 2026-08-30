const charAt = (text: string, index: number): string => {
  const char = text[index]
  if (char === undefined) {
    throw new Error("damerauLevenshtein: index out of range")
  }
  return char
}

const charsOf = (text: string): ReadonlyArray<string> =>
  Array.from({ length: text.length }, (_, index) => charAt(text, index))

const rowFor = (
  leftChar: string,
  prevLeftChar: string | undefined,
  right: string,
  prev: ReadonlyArray<number>,
  beforePrev: ReadonlyArray<number> | undefined,
  rowIndex: number,
): ReadonlyArray<number> =>
  charsOf(right).reduce<ReadonlyArray<number>>(
    (row, rightChar, column) => {
      const cost = leftChar === rightChar ? 0 : 1
      const insertion = row[column] + 1
      const deletion = prev[column + 1] + 1
      const substitution = prev[column] + cost
      const best = Math.min(insertion, deletion, substitution)
      const canTranspose =
        beforePrev !== undefined &&
        prevLeftChar !== undefined &&
        column > 0 &&
        leftChar === charAt(right, column - 1) &&
        prevLeftChar === rightChar
      const transposed = canTranspose ? beforePrev[column - 1] + 1 : best
      return [...row, Math.min(best, transposed)]
    },
    [rowIndex + 1],
  )

export const damerauLevenshtein = (left: string, right: string): number => {
  if (left === right) {
    return 0
  }
  if (left.length === 0) {
    return right.length
  }
  if (right.length === 0) {
    return left.length
  }

  const first = [
    0,
    ...charsOf(right).map((_, index) => index + 1),
  ]
  const rows = charsOf(left).reduce<ReadonlyArray<ReadonlyArray<number>>>(
    (prevRows, leftChar, index) => [
      ...prevRows,
      rowFor(
        leftChar,
        index === 0 ? undefined : charAt(left, index - 1),
        right,
        prevRows[prevRows.length - 1],
        index === 0 ? undefined : prevRows[prevRows.length - 2],
        index,
      ),
    ],
    [first],
  )

  const last = rows[rows.length - 1]
  return last[last.length - 1]
}
