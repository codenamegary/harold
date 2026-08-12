import { afterEach, describe, expect, test } from "bun:test"
import { mkdtemp, rm, writeFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { spawnFakeAcp } from "test-support/spawn"
import { createAcpSupervisor } from "./supervisor/acp-supervisor"
import { SpawnedAgentProcess } from "./supervisor/spawn-agent-process"

const tempDirs: string[] = []
const fakeProcesses: Array<{ kill: () => void }> = []

const createRepository = () => ({
  list: () => [
    { id: "cursor" as const, enabled: true, path: "/fake/agent", args: ["acp"] },
  ],
})

const createTempWorkspace = async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "agent-server-acp-workspace-"))
  tempDirs.push(dir)
  return dir
}

const parseJsonRpcLine = (line: string) => JSON.parse(line.trim()) as {
  id?: number
  result?: unknown
  error?: { code: number; message: string }
}

const waitForResponse = async (responses: string[], id: number, timeoutMs = 5000) => {
  const started = Date.now()
  const read = async (): Promise<unknown> => {
    const match = responses
      .map((chunk) => chunk.split("\n").filter((line) => line.trim().length > 0))
      .flat()
      .map(parseJsonRpcLine)
      .find((message) => message.id === id)

    if (match) {
      return match
    }

    if (Date.now() - started > timeoutMs) {
      throw new Error(`timed out waiting for response id ${id}`)
    }

    await new Promise((resolve) => setTimeout(resolve, 20))
    return read()
  }

  return read()
}

const createHarness = (
  fakeOptions: Parameters<typeof spawnFakeAcp>[0] = {},
  supervisorOptions: {
    requestCursor?: Parameters<typeof createAcpSupervisor>[0]["requestCursor"]
  } = {},
) => {
  const responses: string[] = []
  const fake = spawnFakeAcp(fakeOptions)
  fakeProcesses.push(fake)

  const spawnAgentProcessFn = (): SpawnedAgentProcess => ({
    stdin: {
      write: (chunk: string) => {
        responses.push(chunk)
        return fake.stdin.write(chunk)
      },
    },
    stdout: fake.stdout,
    kill: () => fake.kill(),
    waitForExit: () => fake.process.exited,
  })

  const supervisor = createAcpSupervisor({
    agentSettingsRepository: createRepository(),
    serverVersion: "0.1.0",
    spawnAgentProcessFn,
    ...supervisorOptions,
  })

  return { supervisor, responses, fake }
}

afterEach(async () => {
  fakeProcesses.splice(0).forEach((process) => process.kill())
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })))
})

describe("ACP client handlers integration", () => {
  test("rejects permission requests when permission service is unavailable", async () => {
    const { supervisor, responses } = createHarness({
      emitPermissionRequest: true,
      sessionNewSessionId: "permission-session",
    })

    await supervisor.start("cursor")
    const transport = supervisor.getTransport()
    expect(transport).not.toBeNull()

    await transport!.request("session/new", { cwd: "/tmp", mcpServers: [] })

    const response = await waitForResponse(responses, 1000)
    expect(response).toMatchObject({
      id: 1000,
      error: { message: "permission service unavailable" },
    })

    await supervisor.stop()
  })

  test("reads and writes files within the bound workspace root", async () => {
    const workspace = await createTempWorkspace()
    const filePath = path.join(workspace, "readme.txt")
    await writeFile(filePath, "hello workspace", "utf8")

    const { supervisor, responses } = createHarness({
      emitFsReadRequest: true,
      emitFsWriteRequest: true,
      sessionNewSessionId: "fs-session",
      fsReadPath: filePath,
      fsWritePath: path.join(workspace, "output.txt"),
      fsWriteContent: "written-by-agent",
    })

    await supervisor.start("cursor")
    const transport = supervisor.getTransport()
    await transport!.request("session/new", { cwd: workspace, mcpServers: [] })
    supervisor.getSessionBindingRegistry().bind({
      acpSessionId: "fs-session",
      workspaceRoot: workspace,
    })

    const readResponse = await waitForResponse(responses, 1001)
    expect(readResponse).toMatchObject({
      id: 1001,
      result: { content: "hello workspace" },
    })

    const writeResponse = await waitForResponse(responses, 1002)
    expect(writeResponse).toMatchObject({
      id: 1002,
      result: {},
    })

    await supervisor.stop()
  })

  test("rejects filesystem paths outside the workspace root", async () => {
    const workspace = await createTempWorkspace()
    const outsideFile = path.join(os.tmpdir(), `outside-${Date.now()}.txt`)
    await writeFile(outsideFile, "outside", "utf8")
    tempDirs.push(outsideFile)

    const { supervisor, responses } = createHarness({
      emitFsReadRequest: true,
      sessionNewSessionId: "fs-session",
      fsReadPath: outsideFile,
    })

    await supervisor.start("cursor")
    const transport = supervisor.getTransport()
    await transport!.request("session/new", { cwd: workspace, mcpServers: [] })
    supervisor.getSessionBindingRegistry().bind({
      acpSessionId: "fs-session",
      workspaceRoot: workspace,
    })

    const response = await waitForResponse(responses, 1001)
    expect(response).toMatchObject({
      id: 1001,
      error: { message: "path outside workspace root" },
    })

    await supervisor.stop()
  })

  test("creates terminals scoped to the workspace root", async () => {
    const workspace = await createTempWorkspace()

    const { supervisor, responses } = createHarness({
      emitTerminalCreateRequest: true,
      sessionNewSessionId: "terminal-session",
      terminalCommand: "echo terminal-ok",
    })

    await supervisor.start("cursor")
    const transport = supervisor.getTransport()
    await transport!.request("session/new", { cwd: workspace, mcpServers: [] })
    supervisor.getSessionBindingRegistry().bind({
      acpSessionId: "terminal-session",
      workspaceRoot: workspace,
    })

    const createResponse = await waitForResponse(responses, 1003) as {
      id: number
      result: { terminalId: string }
    }
    expect(createResponse.result.terminalId).toMatch(/^term-/)

    await supervisor.stop()
  })

  test("forwards cursor extension methods through requestCursor and rejects unknown extensions", async () => {
    const logged: string[] = []
    const originalWarn = console.warn
    console.warn = (message?: unknown) => {
      logged.push(String(message))
    }

    const { supervisor, responses } = createHarness(
      {
        emitCursorAskQuestion: true,
        emitCursorCreatePlan: true,
        emitUnknownExtension: true,
        sessionNewSessionId: "extension-session",
      },
      {
        requestCursor: async ({ method }) => {
          if (method === "cursor/ask_question") {
            return {
              outcome: {
                outcome: "answered",
                answers: [{ questionId: "q1", selectedOptionIds: ["opt-a"] }],
              },
            }
          }
          if (method === "cursor/create_plan") {
            return { outcome: { outcome: "accepted" } }
          }
          throw new Error(`unexpected cursor method ${method}`)
        },
      },
    )

    await supervisor.start("cursor")
    const transport = supervisor.getTransport()
    await transport!.request("session/new", { cwd: "/tmp", mcpServers: [] })

    const askResponse = await waitForResponse(responses, 1004)
    expect(askResponse).toMatchObject({
      id: 1004,
      result: {
        outcome: {
          outcome: "answered",
          answers: [{ questionId: "q1", selectedOptionIds: ["opt-a"] }],
        },
      },
    })

    const planResponse = await waitForResponse(responses, 1005)
    expect(planResponse).toMatchObject({
      id: 1005,
      result: { outcome: { outcome: "accepted" } },
    })

    const unknownResponse = await waitForResponse(responses, 1006)
    expect(unknownResponse).toMatchObject({
      id: 1006,
      error: { message: "unknown extension: vendor/unknown_method" },
    })
    expect(logged).toContain("unknown ACP extension: vendor/unknown_method")

    console.warn = originalWarn
    await supervisor.stop()
  })
})
