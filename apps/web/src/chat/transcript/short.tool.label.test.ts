import { describe, expect, test } from "bun:test"
import { shortToolLabel } from "./short.tool.label"
import { TranscriptToolRow } from "./rows"

const longCommand =
  'grep -n -i "name" /home/codenamegary/.local/share/pi-node/node-v22.23.2-linux-x64/lib/node_modules/@arendil-works/pi-coding-agent/docs/session-format.md | head -15'

const toolRow = (overrides: Partial<TranscriptToolRow>): TranscriptToolRow => ({
  kind: "tool",
  turnId: "turn_1",
  toolCallId: "t1",
  toolName: "bash",
  toolKind: "execute",
  status: "completed",
  ...overrides,
})

describe("shortToolLabel", () => {
  test("keeps the whole first line of a long backticked command", () => {
    const label = shortToolLabel(toolRow({ toolName: `\`${longCommand}` }))
    expect(label).toBe(longCommand)
  })

  test("keeps the whole first line of a long detail", () => {
    const label = shortToolLabel(toolRow({ detail: longCommand }))
    expect(label).toBe(`bash · ${longCommand}`)
  })

  test("summarizes only the first line of a multi-line command", () => {
    const label = shortToolLabel(toolRow({ toolName: "`ls src\necho done" }))
    expect(label).toBe("ls src")
  })
})
