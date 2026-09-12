import { render } from "@testing-library/react"
import { describe, expect, test } from "bun:test"
import { ChatTranscript } from "./ChatTranscript"
import { TranscriptRow } from "./rows"

const longCommand =
  'grep -n -i "name" /home/codenamegary/.local/share/pi-node/node-v22.23.2-linux-x64/lib/node_modules/@arendil-works/pi-coding-agent/docs/session-format.md | head -15'

describe("tool call text wrapping", () => {
  test("summary rows wrap long commands instead of truncating", () => {
    const rows: TranscriptRow[] = [
      { kind: "user", turnId: "turn_1", text: "go" },
      {
        kind: "tool",
        turnId: "turn_1",
        toolCallId: "t1",
        toolName: "bash",
        toolKind: "execute",
        status: "completed",
        detail: longCommand,
      },
    ]
    const { getByText } = render(<ChatTranscript rows={rows} />)

    const label = getByText(`bash · ${longCommand} · completed`)
    expect(label.className).not.toContain("truncate")
    expect(label.className).toContain("wrap-anywhere")
    expect(label.className).toContain("whitespace-pre-wrap")

    const details = label.closest("details")
    const body = details?.querySelector("pre")
    expect(body?.className).toContain("wrap-anywhere")
  })

  test("activity status tool label wraps long commands", () => {
    const rows: TranscriptRow[] = [
      { kind: "user", turnId: "turn_1", text: "go" },
      {
        kind: "tool",
        turnId: "turn_1",
        toolCallId: "t1",
        toolName: "bash",
        toolKind: "execute",
        status: "in_progress",
        detail: longCommand,
      },
    ]
    const { getByTestId } = render(<ChatTranscript rows={rows} isRunning />)

    const label = getByTestId("activity-status-line").querySelector(
      ".thinking-indicator-label",
    )
    expect(label?.className).toContain("wrap-anywhere")
  })
})
