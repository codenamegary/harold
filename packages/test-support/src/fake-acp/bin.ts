import { readFakeAcpConfig } from "./config"
import {
  completePromptIfActive,
  handleJsonRpcMessage,
  shouldEmitDeferredNotification,
} from "./handlers"
import { createFakeAcpPromptState } from "./prompt-state"
import {
  isJsonRpcNotification,
  isJsonRpcRequest,
  JsonRpcNotification,
  parseJsonRpcLine,
  serializeJsonRpcMessage,
} from "./protocol"

const PERMISSION_REQUEST_ID = 1000

export const runFakeAcpStdio = (
  input: NodeJS.ReadableStream = process.stdin,
  output: NodeJS.WritableStream = process.stdout,
) => {
  const config = readFakeAcpConfig()
  const promptState = createFakeAcpPromptState()
  const buffer: string[] = [""]
  let heldPromptSessionId: string | undefined

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

  const schedulePromptCompletion = (sessionId: string, delayMs: number) => {
    setTimeout(() => {
      const response = completePromptIfActive(promptState, sessionId)
      if (response === undefined) {
        return
      }

      output.write(serializeJsonRpcMessage(response))
    }, delayMs)
  }

  const flushLine = (line: string) => {
    const message = parseJsonRpcLine(line)

    if (isJsonRpcNotification(message)) {
      const handled = handleJsonRpcMessage(message, config, promptState)
      if (handled !== undefined && "promptResponse" in handled && handled.promptResponse) {
        output.write(serializeJsonRpcMessage(handled.promptResponse))
      }
      return
    }

    if ("id" in message && !("method" in message)) {
      if (message.id === PERMISSION_REQUEST_ID && heldPromptSessionId !== undefined) {
        const response = completePromptIfActive(promptState, heldPromptSessionId)
        heldPromptSessionId = undefined
        if (response !== undefined) {
          output.write(serializeJsonRpcMessage(response))
        }
      }
      return
    }

    if (!isJsonRpcRequest(message)) {
      return
    }

    const request = message
    const handled = handleJsonRpcMessage(request, config, promptState)
    if (!handled || !("outbound" in handled)) {
      return
    }

    handled.notifications.forEach((notification) => {
      output.write(serializeJsonRpcMessage(notification))
    })
    if (handled.response !== undefined) {
      output.write(serializeJsonRpcMessage(handled.response))
    }
    handled.outbound.forEach((outboundMessage) => {
      output.write(serializeJsonRpcMessage(outboundMessage))
    })

    const promptSessionId =
      request.method === "session/prompt"
        ? (request.params as { sessionId?: string } | undefined)?.sessionId
        : undefined
    if (promptSessionId !== undefined && handled.holdPromptResponse === true && handled.outbound.length > 0) {
      heldPromptSessionId = promptSessionId
    }
    if (promptSessionId !== undefined && handled.deferredNotifications.length > 0) {
      scheduleDeferredNotifications(promptSessionId, handled.deferredNotifications)
    }
    if (
      promptSessionId !== undefined
      && handled.holdPromptResponse === true
      && handled.promptCompletionDelayMs !== undefined
    ) {
      schedulePromptCompletion(promptSessionId, handled.promptCompletionDelayMs)
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
