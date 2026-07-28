import { fileURLToPath } from "node:url"
import { fakeAcpEnvFromCapabilities, FakeAcpCapabilities } from "../fake-acp/config"

export type SpawnFakeAcpOptions = {
  capabilities?: Partial<FakeAcpCapabilities>
  sessionNewSessionId?: string
  sessionLoadSessionId?: string
  emitPermissionRequest?: boolean
  emitPermissionRequestNoAllow?: boolean
  emitFsReadRequest?: boolean
  emitFsWriteRequest?: boolean
  emitTerminalCreateRequest?: boolean
  emitCursorAskQuestion?: boolean
  emitCursorCreatePlan?: boolean
  emitUnknownExtension?: boolean
  fsReadPath?: string
  fsWritePath?: string
  fsWriteContent?: string
  terminalCommand?: string
}

export type SpawnedFakeAcp = {
  process: Bun.Subprocess<"pipe", "pipe", "pipe">
  stdin: Bun.FileSink
  stdout: ReadableStream<Uint8Array>
  stderr: ReadableStream<Uint8Array>
  executablePath: string
  kill: () => void
}

const resolveFakeAcpBinPath = (): string => {
  const packageRoot = fileURLToPath(new URL("../..", import.meta.url))
  return `${packageRoot}/src/fake-acp/bin.ts`
}

export const spawnFakeAcp = (options: SpawnFakeAcpOptions = {}): SpawnedFakeAcp => {
  const executablePath = resolveFakeAcpBinPath()
  const env = {
    ...process.env,
    ...fakeAcpEnvFromCapabilities(options),
  }

  const subprocess = Bun.spawn({
    cmd: ["bun", executablePath],
    stdin: "pipe",
    stdout: "pipe",
    stderr: "pipe",
    env,
  })

  if (!subprocess.stdin || !subprocess.stdout || !subprocess.stderr) {
    throw new Error("failed to spawn fake ACP process with stdio pipes")
  }

  return {
    process: subprocess,
    stdin: subprocess.stdin,
    stdout: subprocess.stdout,
    stderr: subprocess.stderr,
    executablePath,
    kill: () => {
      subprocess.kill()
    },
  }
}
