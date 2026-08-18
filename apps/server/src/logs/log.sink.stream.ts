import { Writable } from "node:stream"
import { LogBuffer } from "./log.buffer"
import { parsePinoLine } from "./parse.pino.line"

type CreateLogSinkStreamParams = {
  buffer: LogBuffer
  downstream?: Writable
}

export const createLogSinkStream = (params: CreateLogSinkStreamParams): Writable => {
  const leftover = { value: "" }
  const { buffer, downstream } = params

  return new Writable({
    write(chunk, _encoding, callback) {
      const text = typeof chunk === "string" ? chunk : Buffer.from(chunk).toString("utf8")
      leftover.value += text
      const pieces = leftover.value.split("\n")
      leftover.value = pieces.pop() ?? ""
      pieces.forEach((line) => {
        const record = parsePinoLine(line)
        if (record !== null) {
          buffer.append(record)
        }
      })

      if (downstream === undefined) {
        callback()
        return
      }

      const canContinue = downstream.write(chunk)
      if (canContinue) {
        callback()
        return
      }
      downstream.once("drain", callback)
    },
  })
}
