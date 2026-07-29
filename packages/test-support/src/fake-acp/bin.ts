import { readFakeAcpConfig } from "./config"
import { handleJsonRpcMessage, shouldEmitDeferredNotification } from "./handlers"
import { createFakeAcpPromptState } from "./prompt-state"
import { isJsonRpcRequest, JsonRpcNotification, parseJsonRpcLine, serializeJsonRpcMessage } from "./protocol"

export const runFakeAcpStdio = (
  input: NodeJS.ReadableStream = process.stdin,
  output: NodeJS.WritableStream = process.stdout,
) => {
  const config = readFakeAcpConfig()
  const promptState = createFakeAcpPromptState()
  const buffer: string[] = [""]

  const scheduleDeferredNotifications = (
    sessionId: string,
    deferredNotifications: ReadonlyArray<{
      delayMs: number
      notification: JsonRpcNotification
    }>,
  ) => {
    deferredNotifications.forEach(({ delayMs, notification }) => {
      setTimeout(() => {
        const params = notification.params as { sessionId?: string } | undefined
        const notificationSessionId = params?.sessionId ?? sessionId
        if (!shouldEmitDeferredNotification(promptState, notificationSessionId)) {
          return
        }

        output.write(serializeJsonRpcMessage(notification))
      }, delayMs)
    })
  }

  const flushLine = (line: string) => {
    const message = parseJsonRpcLine(line)
    if (!isJsonRpcRequest(message)) {
      return
    }

    const handled = handleJsonRpcMessage(message, config, promptState)
    if (!handled) {
      return
    }

    handled.notifications.forEach((notification) => {
      output.write(serializeJsonRpcMessage(notification))
    })
    output.write(serializeJsonRpcMessage(handled.response))
    handled.outbound.forEach((outboundMessage) => {
      output.write(serializeJsonRpcMessage(outboundMessage))
    })

    const promptSessionId =
      message.method === "session/prompt"
        ? (message.params as { sessionId?: string } | undefined)?.sessionId
        : undefined
    if (promptSessionId !== undefined && handled.deferredNotifications.length > 0) {
      scheduleDeferredNotifications(promptSessionId, handled.deferredNotifications)
    }
  }

  input.on("data", (chunk: Buffer | string) => {
    const text = chunk.toString()
    const parts = `${buffer.pop() ?? ""}${text}`.split("\n")
    const remainder = parts.pop() ?? ""
    buffer.push(remainder)
    parts.filter((part) => part.trim().length > 0).forEach(flushLine)
  })
}

if (import.meta.main) {
  runFakeAcpStdio()
}
