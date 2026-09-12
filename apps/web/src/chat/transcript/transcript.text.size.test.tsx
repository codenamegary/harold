import { render } from "@testing-library/react"
import { describe, expect, it } from "bun:test"
import { ActivityStatusLine } from "./ActivityStatusLine"
import { ChatTranscript } from "./ChatTranscript"
import { WelcomeMessage } from "./WelcomeMessage"
import { TranscriptRow } from "./rows"

const rows: ReadonlyArray<TranscriptRow> = [
  { kind: "user", turnId: "turn-1", text: "List the files in src" },
  {
    kind: "thinking",
    turnId: "turn-1",
    text: "The user wants a directory listing.",
  },
  {
    kind: "tool",
    turnId: "turn-1",
    toolCallId: "call-1",
    toolName: "bash",
    toolKind: "execute",
    status: "completed",
    detail: "ls src",
  },
  {
    kind: "assistant",
    turnId: "turn-1",
    text: "Here are the files in **src**.",
  },
]

describe("conversation stream text sizing", () => {
  it("renders every conversation element at base size, never small", () => {
    const { container } = render(
      <>
        <WelcomeMessage />
        <ChatTranscript rows={rows} />
        <ActivityStatusLine label="Running" subtitle="bash · completed" />
      </>,
    )

    expect(container.querySelectorAll(".text-sm")).toHaveLength(0)
    expect(container.querySelector(".markdown-message.text-base")).not.toBeNull()
  })
})
