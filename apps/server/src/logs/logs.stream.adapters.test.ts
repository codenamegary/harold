import { describe, expect, test } from "bun:test"
import { Writable } from "node:stream"
import { SpawnedAgentProcess } from "../acp/supervisor/models"
import { LogRecordInput } from "./logs.models"
import { createLogSinkStream, createLoggedAgentSpawn } from "./logs.stream.adapters"

const fakeAgentProcess = (): SpawnedAgentProcess => ({
  stdin: { write: () => {} },
  stdout: new ReadableStream<Uint8Array>(),
  kill: () => {},
  waitForExit: async () => 0,
})

describe("createLogSinkStream", () => {
  test("parses pino lines, appends records, and forwards chunks downstream", async () => {
    const appended: LogRecordInput[] = []
    const forwarded: string[] = []
    const downstream = new Writable({
      write(chunk, _encoding, callback) {
        forwarded.push(chunk.toString("utf8"))
        callback()
      },
    })
    const sink = createLogSinkStream({
      appendLog: (input) => {
        appended.push(input)
        return { ...input, id: "1" }
      },
      downstream,
    })

    sink.write('{"level":30,"time":1755460800000,"msg":"hello"}\n')
    sink.write("not json\n")
    await new Promise<void>((resolve) => sink.end(resolve))

    expect(appended).toHaveLength(2)
    expect(appended[0]).toEqual({
      ts: "2025-08-17T20:00:00.000Z",
      level: "info",
      source: "server",
      message: "hello",
      agentId: undefined,
    })
    expect(appended[1]?.message).toBe("not json")
    expect(forwarded).toHaveLength(2)
  })

  test("keeps a partial line buffered until the rest arrives", async () => {
    const appended: LogRecordInput[] = []
    const sink = createLogSinkStream({
      appendLog: (input) => {
        appended.push(input)
        return { ...input, id: "1" }
      },
    })

    sink.write('{"level":30,"msg":"hel')
    sink.write('lo"}\n')
    await new Promise<void>((resolve) => sink.end(resolve))

    expect(appended).toHaveLength(1)
    expect(appended[0]?.message).toBe("hello")
  })
})

describe("createLoggedAgentSpawn", () => {
  test("appends agent stderr lines and passes the rest of the spawn input through", () => {
    const appended: LogRecordInput[] = []
    const captured: {
      executablePath: string
      args: readonly string[]
      onStderrLine?: (line: string) => void
    }[] = []
    const spawnAgentProcess = (input: {
      executablePath: string
      args: readonly string[]
      onStderrLine?: (line: string) => void
    }) => {
      captured.push(input)
      return fakeAgentProcess()
    }

    const spawn = createLoggedAgentSpawn({
      appendLog: (input) => {
        appended.push(input)
        return { ...input, id: "1" }
      },
      spawnAgentProcess,
    })

    const spawned = spawn({
      profile: {
        id: "cursor",
        command: ["cursor-agent"],
        authMethodId: "none",
        clientCapabilities: {} as never,
      },
      executablePath: "/usr/bin/cursor-agent",
      args: ["--acp"],
    })

    captured[0]?.onStderrLine?.("agent booting")
    spawned.kill()

    expect(appended).toHaveLength(1)
    expect(appended[0]).toMatchObject({
      level: "info",
      source: "agent",
      agentId: "cursor",
      message: "agent booting",
    })
    expect(captured[0]).toMatchObject({
      executablePath: "/usr/bin/cursor-agent",
      args: ["--acp"],
    })
  })
})
