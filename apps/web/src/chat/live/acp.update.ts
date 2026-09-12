import { z } from "zod"
import { ToolKind, ToolKindSchema } from "contracts/events/primitives"

const AcpUpdateRecordSchema = z.record(z.string(), z.unknown())

const ChunkContentSchema = z.union([
  z.string(),
  z.object({ text: z.string() }).passthrough(),
])

const ToolCallStatusSchema = z.enum([
  "pending",
  "in_progress",
  "completed",
  "failed",
])
const ToolCallUpdateStatusSchema = ToolCallStatusSchema

const readUpdateKind = (fields: Record<string, unknown>): string | undefined => {
  const sessionUpdate = z.string().safeParse(fields.sessionUpdate)
  if (sessionUpdate.success) {
    return sessionUpdate.data
  }

  const updateKind = z.string().safeParse(fields.updateKind)
  if (updateKind.success) {
    return updateKind.data
  }

  const kind = z.string().safeParse(fields.kind)
  if (kind.success) {
    return kind.data
  }

  return undefined
}

const readChunkText = (fields: Record<string, unknown>): string | undefined => {
  const text = z.string().safeParse(fields.text)
  if (text.success) {
    return text.data
  }

  const content = ChunkContentSchema.safeParse(fields.content)
  if (!content.success) {
    return undefined
  }

  return typeof content.data === "string" ? content.data : content.data.text
}

const readMessageId = (fields: Record<string, unknown>): string | undefined => {
  const messageId = z.string().min(1).safeParse(fields.messageId)
  return messageId.success ? messageId.data : undefined
}

const readToolName = (fields: Record<string, unknown>): string | undefined => {
  const toolName = z.string().min(1).safeParse(fields.toolName)
  if (toolName.success) {
    return toolName.data
  }

  const name = z.string().min(1).safeParse(fields.name)
  if (name.success) {
    return name.data
  }

  const title = z.string().min(1).safeParse(fields.title)
  if (title.success) {
    return title.data
  }

  return undefined
}

const readToolKind = (fields: Record<string, unknown>): ToolKind => {
  const parsed = ToolKindSchema.safeParse(fields.toolKind ?? fields.kind)
  if (parsed.success) {
    return parsed.data
  }

  return "execute"
}

const TextBlockSchema = z.object({ text: z.string() }).passthrough()
const NestedTextBlockSchema = z
  .object({ content: TextBlockSchema })
  .passthrough()

const readTextFromBlocks = (blocks: unknown): string | undefined => {
  if (!Array.isArray(blocks)) {
    return undefined
  }

  const texts: string[] = []
  for (const block of blocks) {
    if (typeof block === "string") {
      texts.push(block)
      continue
    }
    const text = TextBlockSchema.safeParse(block)
    if (text.success) {
      texts.push(text.data.text)
      continue
    }
    const nested = NestedTextBlockSchema.safeParse(block)
    if (nested.success) {
      texts.push(nested.data.content.text)
    }
  }

  const joined = texts.join("\n").trim()
  return joined.length > 0 ? joined : undefined
}

const readToolDetail = (fields: Record<string, unknown>): string | undefined => {
  const terminal = z
    .object({ _meta: z.object({ terminal_output: z.object({ data: z.string() }) }).passthrough() })
    .passthrough()
    .safeParse(fields)
  if (terminal.success) {
    const data = terminal.data._meta.terminal_output.data
    if (data.trim().length > 0) {
      return data
    }
  }

  const rawOutput = z
    .object({ rawOutput: z.object({ content: z.unknown() }).passthrough() })
    .passthrough()
    .safeParse(fields)
  if (rawOutput.success) {
    const detail = readTextFromBlocks(rawOutput.data.rawOutput.content)
    if (detail !== undefined) {
      return detail
    }
  }

  return readTextFromBlocks(fields.content)
}

export type ParsedAcpUpdate =
  | { kind: "agent_message_chunk"; text: string; messageId?: string }
  | { kind: "agent_thought_chunk"; text: string; messageId?: string }
  | {
      kind: "tool_call"
      toolCallId: string
      toolName: string
      toolKind: ToolKind
      status: "pending" | "in_progress" | "completed" | "failed"
      detail?: string
    }
  | {
      kind: "tool_call_update"
      toolCallId: string
      toolName?: string
      toolKind?: ToolKind
      status: "pending" | "in_progress" | "completed" | "failed"
      detail?: string
    }
  | { kind: "user_message_chunk"; text: string; messageId?: string }
  | { kind: "ignored" }

export const parseAcpUpdate = (update: unknown): ParsedAcpUpdate => {
  const record = AcpUpdateRecordSchema.safeParse(update)
  if (!record.success) {
    return { kind: "ignored" }
  }

  const fields = record.data
  const updateKind = readUpdateKind(fields)
  if (updateKind === undefined) {
    return { kind: "ignored" }
  }

  switch (updateKind) {
    case "agent_message_chunk": {
      const text = readChunkText(fields)
      if (text === undefined) {
        return { kind: "ignored" }
      }
      const messageId = readMessageId(fields)
      return {
        kind: "agent_message_chunk",
        text,
        ...(messageId === undefined ? {} : { messageId }),
      }
    }
    case "agent_thought_chunk": {
      const text = readChunkText(fields)
      if (text === undefined) {
        return { kind: "ignored" }
      }
      const messageId = readMessageId(fields)
      return {
        kind: "agent_thought_chunk",
        text,
        ...(messageId === undefined ? {} : { messageId }),
      }
    }
    case "tool_call": {
      const toolCallId = z.string().min(1).safeParse(fields.toolCallId)
      const toolName = readToolName(fields)
      const status = ToolCallStatusSchema.catch("pending").parse(fields.status)
      if (!toolCallId.success || toolName === undefined) {
        return { kind: "ignored" }
      }
      return {
        kind: "tool_call",
        toolCallId: toolCallId.data,
        toolName,
        toolKind: readToolKind(fields),
        status,
        ...(readToolDetail(fields) === undefined
          ? {}
          : { detail: readToolDetail(fields) }),
      }
    }
    case "tool_call_update": {
      const toolCallId = z.string().min(1).safeParse(fields.toolCallId)
      const status = ToolCallUpdateStatusSchema.safeParse(fields.status)
      if (!toolCallId.success || !status.success) {
        return { kind: "ignored" }
      }

      const toolName = readToolName(fields)
      const toolKind = ToolKindSchema.safeParse(fields.toolKind ?? fields.kind)
      const detail = readToolDetail(fields)
      return {
        kind: "tool_call_update",
        toolCallId: toolCallId.data,
        ...(toolName === undefined ? {} : { toolName }),
        ...(toolKind.success ? { toolKind: toolKind.data } : {}),
        ...(detail === undefined ? {} : { detail }),
        status: status.data,
      }
    }
    case "user_message_chunk": {
      const text = readChunkText(fields)
      if (text === undefined || text.length === 0) {
        return { kind: "ignored" }
      }
      const messageId = readMessageId(fields)
      return {
        kind: "user_message_chunk",
        text,
        ...(messageId === undefined ? {} : { messageId }),
      }
    }
    default:
      return { kind: "ignored" }
  }
}
