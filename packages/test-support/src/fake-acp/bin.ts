import { readFakeAcpConfig } from "./config"
import { handleJsonRpcMessage } from "./handlers"
import { isJsonRpcRequest, parseJsonRpcLine, serializeJsonRpcMessage } from "./protocol"

export const runFakeAcpStdio = (
  input: NodeJS.ReadableStream = process.stdin,
  output: NodeJS.WritableStream = process.stdout,
) => {
  const config = readFakeAcpConfig()
  const buffer: string[] = [""]

  const flushLine = (line: string) => {
    const message = parseJsonRpcLine(line)
    if (!isJsonRpcRequest(message)) {
      return
    }

    const handled = handleJsonRpcMessage(message, config)
    if (!handled) {
      return
    }

    output.write(serializeJsonRpcMessage(handled.response))
    handled.outbound.forEach((outboundMessage) => {
      output.write(serializeJsonRpcMessage(outboundMessage))
    })
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
