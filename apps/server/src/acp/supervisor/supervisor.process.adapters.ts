import { AgentProfile } from "../agent.profile"
import { SpawnedAgentProcess } from "./models"

export type SpawnAgentProcessParams = {
  profile: AgentProfile
  executablePath: string
  args: readonly string[]
  onStderrLine?: (line: string) => void
}

export const buildAgentSpawnCommand = (
  executablePath: string,
  args: readonly string[],
): readonly string[] => [executablePath, ...args]

const drainAgentStderr = async (
  stderr: ReadableStream<Uint8Array>,
  onStderrLine?: (line: string) => void,
) => {
  const reader = stderr.getReader()
  const decoder = new TextDecoder()
  const leftover = { value: "" }

  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) {
        leftover.value += decoder.decode()
        leftover.value.split("\n").forEach((line) => {
          if (line.length > 0) {
            onStderrLine?.(line)
          }
        })
        leftover.value = ""
        return
      }

      leftover.value += decoder.decode(value, { stream: true })
      const pieces = leftover.value.split("\n")
      leftover.value = pieces.pop() ?? ""
      pieces.forEach((line) => {
        if (line.length > 0) {
          onStderrLine?.(line)
        }
      })
    }
  } catch {
    // Process exited or the stream was cancelled.
  }
}

/** Default `SpawnAgentProcessFn`: spawns the agent child via `Bun.spawn`. */
export const spawnAgentProcess = (params: SpawnAgentProcessParams): SpawnedAgentProcess => {
  const { executablePath, args, onStderrLine } = params
  const cmd = buildAgentSpawnCommand(executablePath, args)
  const subprocess = Bun.spawn({
    cmd: [...cmd],
    stdin: "pipe",
    stdout: "pipe",
    stderr: "pipe",
  })

  if (!subprocess.stdin || !subprocess.stdout || !subprocess.stderr) {
    throw new Error("failed to spawn agent process with stdio pipes")
  }

  void drainAgentStderr(subprocess.stderr, onStderrLine)

  return {
    stdin: subprocess.stdin,
    stdout: subprocess.stdout,
    kill: () => {
      subprocess.kill()
    },
    waitForExit: () => subprocess.exited,
  }
}
