/**
 * `marks.log` rows, byte for byte in the grammar `build_capture.py` parses.
 *
 * The grammar, as `drive_phone.py` wrote it and `build_capture.read_events()`
 * reads it back:
 *
 *     tap <mono> <x> <y>
 *     key <mono>
 *     sync_wake <mono>
 *     <name> <mono>
 *
 * `<mono>` is host monotonic seconds at 3 decimal places, whitespace separated,
 * one row per line. `tap` puts the timestamp before the coordinates.
 *
 * `build_capture.py` filters rows into a slice by time, and it walks the file
 * in order to pair every `key` run with the `keys_done` that closes it. Rows
 * for one slice are buffered and written in time order.
 */

export const MONO_DIGITS = 3

/** Format host monotonic seconds the way `f"{now:.3f}"` does in Python. */
export const mono = (seconds: number): string => seconds.toFixed(MONO_DIGITS)

export type MarkRow = Readonly<{
  /** Host monotonic seconds. Also the sort key for the slice flush. */
  atSec: number
  text: string
}>

export type RowFields = Readonly<{ atSec: number; x: number; y: number }>

export const tapRow = ({ atSec, x, y }: RowFields): MarkRow => ({
  atSec,
  text: `tap ${mono(atSec)} ${Math.round(x)} ${Math.round(y)}`,
})

export const keyRow = (atSec: number): MarkRow => ({ atSec, text: `key ${mono(atSec)}` })

export const syncWakeRow = (atSec: number): MarkRow => ({
  atSec,
  text: `sync_wake ${mono(atSec)}`,
})

export const markRow = (name: string, atSec: number): MarkRow => ({
  atSec,
  text: `${name} ${mono(atSec)}`,
})

/** A device mark becomes `key` or a plain `<name>` row, exactly as before. */
export const deviceMarkRow = (kind: string, atSec: number): MarkRow =>
  kind === "key" ? keyRow(atSec) : markRow(kind, atSec)

/** Stable: equal timestamps keep the order they were recorded in. */
export const sortRows = (rows: readonly MarkRow[]): readonly MarkRow[] =>
  [...rows].sort((left, right) => left.atSec - right.atSec)

export const renderRows = (rows: readonly MarkRow[]): string =>
  rows.map((row) => `${row.text}\n`).join("")

/**
 * Every `key` run must be closed by a `keys_done` mark, in ledger order. This is
 * `build_capture.check_key_runs()` applied before the rows are written, so a
 * broken typing run is named with the field that produced it.
 *
 * A run is any number of consecutive `key` marks. Only a different kind of mark
 * while a run is still open is an error, which is exactly what the Python reader
 * enforces.
 */
export const assertClosedKeyRuns = (marks: readonly Readonly<{ nanos: number; kind: string }>[]): void => {
  const stillOpen = marks.reduce<number | null>((open, mark) => {
    if (mark.kind === "key") {
      return open ?? mark.nanos
    }
    if (mark.kind === "keys_done") {
      return null
    }
    if (open !== null) {
      throw new Error(
        `the key run opened at device nanos ${open} is not closed by keys_done ` +
          `(found ${mark.kind} at ${mark.nanos})`,
      )
    }
    return null
  }, null)

  if (stillOpen !== null) {
    throw new Error(`the key run opened at device nanos ${stillOpen} is not closed by keys_done`)
  }
}

export const countKeys = (marks: readonly Readonly<{ kind: string }>[]): number =>
  marks.filter((mark) => mark.kind === "key").length

const keyRunKind = (text: string): string => {
  if (text.startsWith("keys_done ")) {
    return "keys_done"
  }
  if (text.startsWith("key ")) {
    return "key"
  }
  return "other"
}

/** Host rows in the shape `assertClosedKeyRuns` checks. `nanos` is the row index. */
export const keyRunMarks = (
  rows: readonly MarkRow[],
): readonly Readonly<{ nanos: number; kind: string }>[] =>
  rows.map((row, index) => ({ nanos: index, kind: keyRunKind(row.text) }))
