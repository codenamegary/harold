import { describe, expect, test } from "bun:test"
import { SessionStreamServerMessage } from "contracts/http/session.stream"
import { createSessionEventLog } from "./event.log"

const ref = { agentId: "cursor" as const, sessionId: "s1" }

const update = (text: string): SessionStreamServerMessage => ({
  type: "session_update",
  agentId: "cursor",
  sessionId: "s1",
  update: { sessionUpdate: "agent_message_chunk", text },
})

describe("session event log", () => {
  test("hands out increasing cursors and catches up after one in order", () => {
    const log = createSessionEventLog({ createEpoch: () => "epoch" })

    const first = log.append({ ...ref, message: update("one") })
    const second = log.append({ ...ref, message: update("two") })
    const third = log.append({ ...ref, message: update("three") })

    expect(first).toBe("epoch:1")
    expect(second).toBe("epoch:2")
    expect(third).toBe("epoch:3")
    expect(log.currentCursor(ref)).toBe("epoch:3")

    expect(log.catchUp({ ...ref, cursor: first })).toEqual([
      { cursor: second, message: update("two") },
      { cursor: third, message: update("three") },
    ])
    expect(log.catchUp({ ...ref, cursor: third })).toEqual([])
  })

  test("a missing event log still has a valid zero cursor", () => {
    const log = createSessionEventLog({ createEpoch: () => "epoch" })

    const cursor = log.currentCursor(ref)

    expect(cursor).toBe("epoch:0")
    expect(log.catchUp({ ...ref, cursor })).toEqual([])
  })

  test("stale, future, malformed, and foreign-epoch cursors are invalid", () => {
    const log = createSessionEventLog({ capacity: 2, createEpoch: () => "epoch" })
    const zero = log.currentCursor(ref)
    log.append({ ...ref, message: update("one") })
    log.append({ ...ref, message: update("two") })
    const third = log.append({ ...ref, message: update("three") })

    expect(log.catchUp({ ...ref, cursor: zero })).toBeNull()
    expect(log.catchUp({ ...ref, cursor: "epoch:4" })).toBeNull()
    expect(log.catchUp({ ...ref, cursor: "not-a-cursor" })).toBeNull()

    const other = createSessionEventLog({ createEpoch: () => "other" })
    const foreign = other.append({ ...ref, message: update("foreign") })
    expect(log.catchUp({ ...ref, cursor: foreign })).toBeNull()

    expect(log.catchUp({ ...ref, cursor: third })).toEqual([])
  })

  test("forget drops the log and invalidates its cursors", () => {
    let nextEpoch = 0
    const log = createSessionEventLog({ createEpoch: () => `epoch-${++nextEpoch}` })
    const cursor = log.append({ ...ref, message: update("one") })

    log.forget(ref)

    expect(log.catchUp({ ...ref, cursor })).toBeNull()
    expect(log.currentCursor(ref)).toBe("epoch-2:0")
    log.append({ ...ref, message: update("recreated") })
    expect(log.catchUp({ ...ref, cursor })).toBeNull()
  })
})
