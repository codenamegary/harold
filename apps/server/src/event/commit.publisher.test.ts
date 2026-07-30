import { describe, expect, test } from "bun:test"
import { createEventCommitPublisher } from "./commit.publisher"
import { ParsedJournalRecord } from "./journal.repository"

const baseRecord = {
  schemaVersion: 1,
  occurredAt: "2026-07-24T12:00:00.000Z",
  sessionSequence: null,
  turnId: null,
  protocolVersion: null,
  direction: null,
  method: null,
  phase: null,
} satisfies Omit<ParsedJournalRecord, "cursor" | "kind" | "workspaceId" | "sessionId" | "payload">

describe("EventCommitPublisher", () => {
  test("publishes records to unfiltered subscribers", () => {
    const publisher = createEventCommitPublisher()
    const received: bigint[] = []

    publisher.subscribe((record) => {
      received.push(record.cursor)
    })

    const record: ParsedJournalRecord = {
      ...baseRecord,
      cursor: 1n,
      kind: "server.status",
      workspaceId: null,
      sessionId: null,
      payload: { state: "online" },
    }

    publisher.publish([record])
    expect(received).toEqual([1n])
  })

  test("filters by workspace and session with AND semantics", () => {
    const publisher = createEventCommitPublisher()
    const received: string[] = []

    publisher.subscribe({ workspaceId: "ws-a", sessionId: "sess-a" }, (record) => {
      received.push(record.kind)
    })

    const records: ParsedJournalRecord[] = [
      {
        ...baseRecord,
        cursor: 1n,
        kind: "session.state",
        workspaceId: "ws-a",
        sessionId: "sess-a",
        payload: { state: "idle" },
      },
      {
        ...baseRecord,
        cursor: 2n,
        kind: "session.state",
        workspaceId: "ws-a",
        sessionId: "sess-b",
        payload: { state: "idle" },
      },
      {
        ...baseRecord,
        cursor: 3n,
        kind: "session.state",
        workspaceId: "ws-b",
        sessionId: "sess-a",
        payload: { state: "idle" },
      },
    ]

    publisher.publish(records)
    expect(received).toEqual(["session.state"])
  })
})
