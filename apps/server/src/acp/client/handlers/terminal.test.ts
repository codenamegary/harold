import { describe, expect, test } from "bun:test"
import { createAcpTerminalHandlers } from "./terminal"
import { createSessionBindingRegistry } from "../session-binding-registry"

describe("createAcpTerminalHandlers", () => {
  test("runs terminal lifecycle methods", async () => {
    const sessionBindingRegistry = createSessionBindingRegistry()
    sessionBindingRegistry.bind({
      acpSessionId: "terminal-session",
      workspaceRoot: "/tmp",
    })

    const outputChunks = ["hello\n", "world\n"]
    const handlers = createAcpTerminalHandlers({
      sessionBindingRegistry,
      createTerminalId: () => "term-test",
      spawnShellCommand: () => ({
        stdout: new ReadableStream({
          start(controller) {
            outputChunks.forEach((chunk) => controller.enqueue(new TextEncoder().encode(chunk)))
            controller.close()
          },
        }),
        stderr: new ReadableStream({
          start(controller) {
            controller.close()
          },
        }),
        exited: Promise.resolve(0),
        kill: () => undefined,
      }),
    })

    const created = await handlers["terminal/create"]({
      sessionId: "terminal-session",
      command: "echo",
      args: ["hello"],
    })
    expect(created).toEqual({ terminalId: "term-test" })

    await new Promise((resolve) => setTimeout(resolve, 20))

    const output = await handlers["terminal/output"]({
      sessionId: "terminal-session",
      terminalId: "term-test",
    })
    expect(output.output).toContain("hello")

    const exitStatus = await handlers["terminal/wait_for_exit"]({
      sessionId: "terminal-session",
      terminalId: "term-test",
    })
    expect(exitStatus).toEqual({ exitCode: 0, signal: null })

    await handlers["terminal/kill"]({
      sessionId: "terminal-session",
      terminalId: "term-test",
    })

    await handlers["terminal/release"]({
      sessionId: "terminal-session",
      terminalId: "term-test",
    })

    await expect(handlers["terminal/output"]({
      sessionId: "terminal-session",
      terminalId: "term-test",
    })).rejects.toMatchObject({ message: "terminal not found" })
  })
})
