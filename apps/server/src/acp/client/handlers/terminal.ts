import { createAcpJsonRpcError, AcpJsonRpcError } from "../../transport/json.rpc.error"
import { SessionBindingRegistry } from "../session.binding.registry"

export type AcpTerminalHandlersDeps = {
  sessionBindingRegistry: SessionBindingRegistry
  spawnShellCommand?: (params: {
    command: string
    cwd: string
    env: Record<string, string>
  }) => TerminalProcess
  createTerminalId?: () => string
}

export type TerminalProcess = {
  stdout: ReadableStream<Uint8Array>
  stderr: ReadableStream<Uint8Array>
  exited: Promise<number | null>
  kill: () => void
}

type TerminalCreateParams = {
  sessionId?: string
  command?: string
  args?: string[]
  env?: Array<{ name: string; value: string }>
  cwd?: string
  outputByteLimit?: number
}

type TerminalSessionParams = {
  sessionId?: string
  terminalId?: string
}

type TerminalExitStatus = {
  exitCode: number | null
  signal: string | null
}

type TerminalState = {
  process: TerminalProcess
  output: string
  outputByteLimit?: number
  exitStatus?: TerminalExitStatus
  released: boolean
}

const ACP_INVALID_REQUEST = -32600
const ACP_APPLICATION_ERROR = -32000

const createAcpError = (message: string, code = ACP_APPLICATION_ERROR): AcpJsonRpcError =>
  createAcpJsonRpcError(message, code)

const defaultCreateTerminalId = (() => {
  const counter = [0]
  return () => {
    counter[0] += 1
    return `term-${counter[0]}`
  }
})()

const defaultSpawnShellCommand = (params: {
  command: string
  cwd: string
  env: Record<string, string>
}): TerminalProcess => {
  const subprocess = Bun.spawn({
    cmd: ["/bin/sh", "-c", params.command],
    cwd: params.cwd,
    env: params.env,
    stdout: "pipe",
    stderr: "pipe",
  })

  return {
    stdout: subprocess.stdout,
    stderr: subprocess.stderr,
    exited: subprocess.exited,
    kill: () => {
      subprocess.kill()
    },
  }
}

const readStreamToString = async (stream: ReadableStream<Uint8Array>): Promise<string> => {
  const reader = stream.getReader()
  const decoder = new TextDecoder()
  const chunks: string[] = []

  const readNext = async (): Promise<void> => {
    const { done, value } = await reader.read()
    if (done) {
      return
    }
    chunks.push(decoder.decode(value, { stream: true }))
    await readNext()
  }

  await readNext()
  return chunks.join("")
}

const appendOutput = (state: TerminalState, chunk: string): string => {
  const combined = `${state.output}${chunk}`
  if (state.outputByteLimit === undefined) {
    return combined
  }

  const encoded = new TextEncoder().encode(combined)
  if (encoded.byteLength <= state.outputByteLimit) {
    return combined
  }

  const truncated = encoded.slice(encoded.byteLength - state.outputByteLimit)
  return new TextDecoder().decode(truncated)
}

const buildShellCommand = (command: string, args?: string[]): string =>
  args && args.length > 0 ? [command, ...args].join(" ") : command

const buildProcessEnv = (
  envEntries?: Array<{ name: string; value: string }>,
): Record<string, string> => {
  const baseEnv = Object.fromEntries(
    Object.entries(process.env).filter(
      (entry): entry is [string, string] => entry[1] !== undefined,
    ),
  )

  return (envEntries ?? []).reduce<Record<string, string>>(
    (env, entry) => ({
      ...env,
      [entry.name]: entry.value,
    }),
    baseEnv,
  )
}

export const createAcpTerminalHandlers = ({
  sessionBindingRegistry,
  spawnShellCommand = defaultSpawnShellCommand,
  createTerminalId = defaultCreateTerminalId,
}: AcpTerminalHandlersDeps) => {
  const terminals = new Map<string, TerminalState>()

  const requireTerminal = (
    params: TerminalSessionParams,
  ): { ok: true; state: TerminalState } | { ok: false; error: AcpJsonRpcError } => {
    if (!params.sessionId) {
      return { ok: false, error: createAcpError("session not bound", ACP_INVALID_REQUEST) }
    }

    const workspaceRoot = sessionBindingRegistry.getWorkspaceRoot(params.sessionId)
    if (!workspaceRoot) {
      return { ok: false, error: createAcpError("session not bound") }
    }

    if (!params.terminalId) {
      return { ok: false, error: createAcpError("terminalId is required", ACP_INVALID_REQUEST) }
    }

    const state = terminals.get(params.terminalId)
    if (!state || state.released) {
      return { ok: false, error: createAcpError("terminal not found") }
    }

    return { ok: true, state }
  }

  const attachOutputReaders = (process: TerminalProcess, onOutput: (chunk: string) => void) => {
    const readStream = async (stream: ReadableStream<Uint8Array>) => {
      const reader = stream.getReader()
      const decoder = new TextDecoder()

      const readNext = async (): Promise<void> => {
        const { done, value } = await reader.read()
        if (done) {
          return
        }
        onOutput(decoder.decode(value, { stream: true }))
        await readNext()
      }

      await readNext()
    }

    void readStream(process.stdout)
    void readStream(process.stderr)
  }

  const attachExitWatcher = (
    process: TerminalProcess,
    onExit: (exitStatus: TerminalExitStatus) => void,
  ) => {
    void process.exited.then((exitCode) => {
      onExit({ exitCode, signal: null })
    })
  }

  return {
    "terminal/create": async (params: unknown) => {
      const request = params as TerminalCreateParams
      if (!request.sessionId) {
        throw createAcpError("session not bound", ACP_INVALID_REQUEST)
      }

      const workspaceRoot = sessionBindingRegistry.getWorkspaceRoot(request.sessionId)
      if (!workspaceRoot) {
        throw createAcpError("session not bound")
      }

      if (!request.command) {
        throw createAcpError("command is required", ACP_INVALID_REQUEST)
      }

      if (request.cwd && request.cwd !== workspaceRoot) {
        throw createAcpError("path outside workspace root")
      }

      const terminalId = createTerminalId()
      const process = spawnShellCommand({
        command: buildShellCommand(request.command, request.args),
        cwd: workspaceRoot,
        env: buildProcessEnv(request.env),
      })

      const state: TerminalState = {
        process,
        output: "",
        outputByteLimit: request.outputByteLimit,
        released: false,
      }

      terminals.set(terminalId, state)
      attachOutputReaders(process, (chunk) => {
        state.output = appendOutput(state, chunk)
      })
      attachExitWatcher(process, (exitStatus) => {
        state.exitStatus = exitStatus
      })

      return { terminalId }
    },

    "terminal/output": async (params: unknown) => {
      const request = params as TerminalSessionParams
      const terminal = requireTerminal(request)
      if (!terminal.ok) {
        throw terminal.error
      }

      const truncated =
        terminal.state.outputByteLimit !== undefined &&
        new TextEncoder().encode(terminal.state.output).byteLength >= terminal.state.outputByteLimit

      return {
        output: terminal.state.output,
        truncated,
        ...(terminal.state.exitStatus ? { exitStatus: terminal.state.exitStatus } : {}),
      }
    },

    "terminal/wait_for_exit": async (params: unknown) => {
      const request = params as TerminalSessionParams
      const terminal = requireTerminal(request)
      if (!terminal.ok) {
        throw terminal.error
      }

      if (!terminal.state.exitStatus) {
        const exitCode = await terminal.state.process.exited
        terminal.state.exitStatus = { exitCode, signal: null }
      }

      return terminal.state.exitStatus
    },

    "terminal/kill": async (params: unknown) => {
      const request = params as TerminalSessionParams
      const terminal = requireTerminal(request)
      if (!terminal.ok) {
        throw terminal.error
      }

      terminal.state.process.kill()
      return {}
    },

    "terminal/release": async (params: unknown) => {
      const request = params as TerminalSessionParams
      const terminal = requireTerminal(request)
      if (!terminal.ok) {
        throw terminal.error
      }

      terminal.state.process.kill()
      terminal.state.released = true
      terminals.delete(request.terminalId ?? "")
      return {}
    },
  }
}

export const drainTerminalOutput = readStreamToString
