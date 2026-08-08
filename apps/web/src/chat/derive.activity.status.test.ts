import { describe, expect, test } from "bun:test"
import { deriveActivityStatus } from "./derive.activity.status"
import { TranscriptRow } from "./transcript.reducer"

const user = (turnId = "turn_1"): TranscriptRow => ({
  kind: "user",
  turnId,
  text: "go",
})

describe("deriveActivityStatus", () => {
  test("returns null when not running", () => {
    expect(
      deriveActivityStatus({
        rows: [user()],
        isRunning: false,
        hasPendingPermission: false,
      }),
    ).toBeNull()
  })

  test("returns waiting for permission over tools and other phases", () => {
    const rows: TranscriptRow[] = [
      user(),
      {
        kind: "tool",
        turnId: "turn_1",
        toolCallId: "t1",
        toolName: "read",
        toolKind: "read",
        status: "pending",
      },
    ]

    expect(
      deriveActivityStatus({
        rows,
        isRunning: true,
        hasPendingPermission: true,
      }),
    ).toEqual({
      phase: "waiting-for-permission",
      label: "Waiting for permission",
    })
  })

  test("returns using tools with active tool subtitle", () => {
    const rows: TranscriptRow[] = [
      user(),
      {
        kind: "tool",
        turnId: "turn_1",
        toolCallId: "t1",
        toolName: "Read File",
        toolKind: "read",
        status: "completed",
        detail: "/tmp/a.ts",
      },
      {
        kind: "tool",
        turnId: "turn_1",
        toolCallId: "t2",
        toolName: "grep",
        toolKind: "execute",
        status: "in_progress",
        detail: "pattern",
      },
    ]

    expect(
      deriveActivityStatus({
        rows,
        isRunning: true,
        hasPendingPermission: false,
      }),
    ).toEqual({
      phase: "using-tools",
      label: "Using tools",
      subtitle: "grep · pattern",
    })
  })

  test("returns replying while assistant output is present", () => {
    const rows: TranscriptRow[] = [
      user(),
      { kind: "assistant", turnId: "turn_1", text: "Hello" },
    ]

    expect(
      deriveActivityStatus({
        rows,
        isRunning: true,
        hasPendingPermission: false,
      }),
    ).toEqual({
      phase: "replying",
      label: "Replying",
    })
  })

  test("returns thinking before assistant output", () => {
    expect(
      deriveActivityStatus({
        rows: [user()],
        isRunning: true,
        hasPendingPermission: false,
      }),
    ).toEqual({
      phase: "thinking",
      label: "Thinking",
    })
  })

  test("returns thinking when thought exists before assistant output", () => {
    const rows: TranscriptRow[] = [
      user(),
      { kind: "thinking", turnId: "turn_1", text: "planning" },
    ]

    expect(
      deriveActivityStatus({
        rows,
        isRunning: true,
        hasPendingPermission: false,
      }),
    ).toEqual({
      phase: "thinking",
      label: "Thinking",
    })
  })

  test("returns working after tools complete and before assistant output", () => {
    const rows: TranscriptRow[] = [
      user(),
      {
        kind: "tool",
        turnId: "turn_1",
        toolCallId: "t1",
        toolName: "read",
        toolKind: "read",
        status: "completed",
      },
    ]

    expect(
      deriveActivityStatus({
        rows,
        isRunning: true,
        hasPendingPermission: false,
      }),
    ).toEqual({
      phase: "working",
      label: "Working",
    })
  })
})
