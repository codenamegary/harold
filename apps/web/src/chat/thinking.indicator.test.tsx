import { describe, expect, test } from "bun:test"
import { render } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { ChatTranscript } from "./ChatTranscript"
import { groupTranscriptRows } from "./group.transcript.rows"
import { ThinkingIndicator } from "./ThinkingIndicator"
import { TranscriptRow } from "./transcript.reducer"

describe("ThinkingIndicator", () => {
  test("renders the shimmer label", () => {
    const { getByText } = render(<ThinkingIndicator />)

    expect(getByText("Thinking")).toBeInTheDocument()
  })
})

describe("ChatTranscript activity status", () => {
  test("shows thinking sticky status while running before assistant output", () => {
    const { getByRole } = render(
      <ChatTranscript
        isRunning
        rows={[{ kind: "user", turnId: "turn_1", text: "Explain auth" }]}
      />,
    )

    expect(getByRole("status", { name: "Thinking" })).toBeInTheDocument()
  })

  test("keeps thinking section static while sticky line shows Thinking", () => {
    const { getByRole, getByText, getAllByText } = render(
      <ChatTranscript
        isRunning
        rows={[
          { kind: "user", turnId: "turn_1", text: "Explain auth" },
          { kind: "thinking", turnId: "turn_1", text: "planning" },
        ]}
      />,
    )

    expect(getByRole("status", { name: "Thinking" })).toBeInTheDocument()
    expect(getByText("planning")).toBeInTheDocument()
    expect(getByText("planning").closest("details")).not.toBeNull()
    expect(getAllByText("Thinking").length).toBeGreaterThanOrEqual(2)
  })

  test("renders completed thinking as a collapsible section", async () => {
    const user = userEvent.setup()
    const { getByText, queryByRole } = render(
      <ChatTranscript
        rows={[
          { kind: "user", turnId: "turn_1", text: "Explain auth" },
          { kind: "thinking", turnId: "turn_1", text: "planning" },
          { kind: "assistant", turnId: "turn_1", text: "Auth uses JWT" },
        ]}
      />,
    )

    expect(queryByRole("status")).toBeNull()
    const summary = getByText("Thinking")
    const details = summary.closest("details")
    expect(details).not.toBeNull()
    expect(details?.open).toBe(false)

    await user.click(summary)
    expect(details?.open).toBe(true)
    expect(getByText("planning")).toBeInTheDocument()
  })

  test("shows replying sticky status while assistant streams", () => {
    const { getByRole, getByText } = render(
      <ChatTranscript
        isRunning
        rows={[
          { kind: "user", turnId: "turn_1", text: "Explain auth" },
          { kind: "thinking", turnId: "turn_1", text: "planning" },
          { kind: "assistant", turnId: "turn_1", text: "Auth uses JWT" },
        ]}
      />,
    )

    expect(getByRole("status", { name: "Replying" })).toBeInTheDocument()
    expect(getByText("Thinking")).toBeInTheDocument()
    expect(getByText("planning")).toBeInTheDocument()
  })

  test("shows using tools sticky status with subtitle", () => {
    const { getByRole, getByText } = render(
      <ChatTranscript
        isRunning
        rows={[
          { kind: "user", turnId: "turn_1", text: "go" },
          {
            kind: "tool",
            turnId: "turn_1",
            toolCallId: "t1",
            toolName: "grep",
            toolKind: "execute",
            status: "pending",
            detail: "pattern",
          },
        ]}
      />,
    )

    expect(
      getByRole("status", { name: "Using tools: grep · pattern" }),
    ).toBeInTheDocument()
    expect(getByText("grep · pattern")).toBeInTheDocument()
  })

  test("shows waiting for permission over other phases", () => {
    const { getByRole } = render(
      <ChatTranscript
        isRunning
        hasPendingPermission
        rows={[
          { kind: "user", turnId: "turn_1", text: "go" },
          {
            kind: "tool",
            turnId: "turn_1",
            toolCallId: "t1",
            toolName: "read",
            toolKind: "read",
            status: "pending",
          },
        ]}
      />,
    )

    expect(
      getByRole("status", { name: "Waiting for permission" }),
    ).toBeInTheDocument()
  })

  test("hides sticky status when not running", () => {
    const { queryByRole } = render(
      <ChatTranscript
        rows={[
          { kind: "user", turnId: "turn_1", text: "Explain auth" },
          { kind: "assistant", turnId: "turn_1", text: "Auth uses JWT" },
        ]}
      />,
    )

    expect(queryByRole("status")).toBeNull()
  })
})

describe("groupTranscriptRows", () => {
  test("collapses consecutive tool rows into one block", () => {
    const rows: TranscriptRow[] = [
      { kind: "user", turnId: "turn_1", text: "go" },
      {
        kind: "tool",
        turnId: "turn_1",
        toolCallId: "t1",
        toolName: "read",
        toolKind: "read",
        status: "completed",
      },
      {
        kind: "tool",
        turnId: "turn_1",
        toolCallId: "t2",
        toolName: "grep",
        toolKind: "execute",
        status: "completed",
      },
      { kind: "assistant", turnId: "turn_1", text: "done" },
    ]

    const blocks = groupTranscriptRows(rows)
    expect(blocks.map((block) => block.kind)).toEqual(["row", "tools", "row"])
    expect(blocks[1]).toMatchObject({ kind: "tools" })
    if (blocks[1]?.kind === "tools") {
      expect(blocks[1].tools).toHaveLength(2)
    }
  })
})

describe("ChatTranscript tool groups", () => {
  test("renders a collapsed tool call summary that expands to nested tool details", async () => {
    const user = userEvent.setup()
    const { getByText, queryByText } = render(
      <ChatTranscript
        rows={[
          { kind: "user", turnId: "turn_1", text: "go" },
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
            status: "completed",
          },
          {
            kind: "tool",
            turnId: "turn_1",
            toolCallId: "t3",
            toolName: "shell",
            toolKind: "execute",
            status: "completed",
          },
          {
            kind: "tool",
            turnId: "turn_1",
            toolCallId: "t4",
            toolName: "edit",
            toolKind: "edit",
            status: "completed",
          },
        ]}
      />,
    )

    expect(getByText("4 tool calls")).toBeInTheDocument()
    const group = getByText("4 tool calls").closest("details")
    expect(group).not.toBeNull()
    expect(group?.open).toBe(false)

    await user.click(getByText("4 tool calls"))
    expect(group?.open).toBe(true)
    expect(getByText("Read File · /tmp/a.ts · completed")).toBeInTheDocument()

    const nested = getByText("Read File · /tmp/a.ts · completed").closest("details")
    expect(nested).not.toBeNull()
    expect(nested?.open).toBe(false)
    await user.click(getByText("Read File · /tmp/a.ts · completed"))
    expect(nested?.open).toBe(true)
    expect(nested?.textContent).toContain("/tmp/a.ts")
    expect(nested?.textContent).toContain("status: completed")
    expect(queryByText("4 tool calls")).toBeInTheDocument()
  })

  test("shows running count while tools are in progress", () => {
    const { getByText } = render(
      <ChatTranscript
        isRunning
        rows={[
          { kind: "user", turnId: "turn_1", text: "go" },
          {
            kind: "tool",
            turnId: "turn_1",
            toolCallId: "t1",
            toolName: "read",
            toolKind: "read",
            status: "completed",
          },
          {
            kind: "tool",
            turnId: "turn_1",
            toolCallId: "t2",
            toolName: "grep",
            toolKind: "execute",
            status: "pending",
          },
        ]}
      />,
    )

    expect(getByText("2 tool calls · 1 running")).toBeInTheDocument()
  })
})
