import { describe, expect, test } from "bun:test"
import { eventCursorToString, parseEventCursor } from "./cursor"

describe("event cursor", () => {
  test("serializes bigint cursors to decimal strings", () => {
    expect(eventCursorToString(0n)).toBe("0")
    expect(eventCursorToString(42n)).toBe("42")
    expect(eventCursorToString(9007199254740991n)).toBe("9007199254740991")
  })

  test("parses unsigned decimal cursor strings", () => {
    expect(parseEventCursor("0")).toBe(0n)
    expect(parseEventCursor("42")).toBe(42n)
    expect(parseEventCursor("9007199254740991")).toBe(9007199254740991n)
    expect(parseEventCursor("evt_01")).toBeUndefined()
  })
})
