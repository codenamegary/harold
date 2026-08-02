import { Writable } from "node:stream"

export type LogCapture = {
  stream: Writable
  getOutput: () => string
}

export const createLogCapture = (): LogCapture => {
  const chunks: string[] = []
  const stream = new Writable({
    write(chunk, _encoding, callback) {
      chunks.push(chunk.toString())
      callback()
    },
  })

  return {
    stream,
    getOutput: () => chunks.join(""),
  }
}

export const assertSecretFreeLogs = (params: {
  logOutput: string
  credential: string
  pairingCode: string
}): void => {
  if (params.logOutput.includes(params.credential)) {
    throw new Error("log output contains raw device credential")
  }

  if (params.logOutput.includes(params.pairingCode)) {
    throw new Error("log output contains raw pairing code")
  }
}
