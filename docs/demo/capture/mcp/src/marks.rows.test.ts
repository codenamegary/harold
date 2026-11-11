import { describe, expect, it } from "bun:test"
import {
  assertClosedKeyRuns,
  countKeys,
  deviceMarkRow,
  keyRow,
  markRow,
  mono,
  renderRows,
  sortRows,
  syncWakeRow,
  tapRow,
} from "./marks"
import type { MarkRow } from "./marks"

/**
 * Byte-for-byte fixture. `build_capture.read_events()` parses
 * `tap <mono> <x> <y>`, `key <mono>`, `sync_wake <mono>` and `<name> <mono>`,
 * with host monotonic seconds at 3 dp and every field whitespace separated.
 */
const EXPECTED = [
  "slice_start_connect_fill 12.500",
  "sync_wake 12.750",
  "tap 13.125 540 1100",
  "key 13.200",
  "key 13.280",
  "key 13.360",
  "keys_done 13.440",
  "host_fields_filled 14.000",
  "slice_end_connect_fill 15.500",
  "sync_wake 15.750",
].join("\n")

describe("marks.log rows", () => {
  it("renders the legacy grammar byte for byte", () => {
    const rows: readonly MarkRow[] = [
      markRow("slice_start_connect_fill", 12.5),
      syncWakeRow(12.75),
      tapRow({ atSec: 13.125, x: 540.4, y: 1099.6 }),
      keyRow(13.2),
      keyRow(13.28),
      keyRow(13.36),
      markRow("keys_done", 13.44),
      markRow("host_fields_filled", 14),
      markRow("slice_end_connect_fill", 15.5),
      syncWakeRow(15.75),
    ]
    expect(renderRows(rows)).toBe(`${EXPECTED}\n`)
  })

  it("formats host monotonic seconds at three decimal places", () => {
    expect(mono(12.5)).toBe("12.500")
    expect(mono(12.3456)).toBe("12.346")
    expect(mono(0)).toBe("0.000")
  })

  it("puts the timestamp before the coordinates on a tap row", () => {
    expect(tapRow({ atSec: 13.125, x: 540, y: 1100 }).text).toBe("tap 13.125 540 1100")
  })

  it("turns a key device mark into a key row and anything else into a named row", () => {
    expect(deviceMarkRow("key", 13.2).text).toBe("key 13.200")
    expect(deviceMarkRow("keys_done", 13.44).text).toBe("keys_done 13.440")
  })

  it("sorts rows by host time so late device marks land in order", () => {
    const sorted = sortRows([syncWakeRow(15.75), tapRow({ atSec: 13.125, x: 1, y: 2 }), keyRow(13.2)])
    expect(sorted.map((row) => row.text)).toEqual(["tap 13.125 1 2", "key 13.200", "sync_wake 15.750"])
  })

  it("keeps two decimal whole seconds stable", () => {
    const rows = renderRows([markRow("a", 1), markRow("b", 1.5)])
    expect(rows).toBe("a 1.000\nb 1.500\n")
  })
})

describe("key runs", () => {
  const ledger = (...kinds: readonly string[]) =>
    kinds.map((kind, index) => ({ nanos: 200_000_000_000 + index * 80_000_000, kind }))

  it("accepts a run of keys closed by keys_done", () => {
    expect(() => assertClosedKeyRuns(ledger("key", "key", "key", "keys_done"))).not.toThrow()
  })

  it("accepts several closed runs in one ledger", () => {
    expect(() =>
      assertClosedKeyRuns(ledger("key", "keys_done", "key", "keys_done")),
    ).not.toThrow()
  })

  it("rejects a run interrupted by another mark", () => {
    expect(() => assertClosedKeyRuns(ledger("key", "tap", "keys_done"))).toThrow(
      /is not closed by keys_done \(found tap at/,
    )
  })

  it("rejects a run with no keys_done at all", () => {
    expect(() => assertClosedKeyRuns(ledger("key", "key"))).toThrow(/is not closed by keys_done$/)
  })

  it("counts only key marks", () => {
    expect(countKeys(ledger("key", "keys_done", "key"))).toBe(2)
  })
})
