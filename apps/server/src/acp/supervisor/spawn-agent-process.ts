import { AgentProfile } from "../agent-profile"

export type SpawnedAgentProcess = {
  stdin: { write: (chunk: string) => void | number | Promise<void | number> }
  stdout: ReadableStream<Uint8Array>
  kill: () => void
  waitForExit: () => Promise<number | null>
}

export type SpawnAgentProcessFn = (input: {
  profile: AgentProfile
  executablePath: string
  args: readonly string[]
}) => SpawnedAgentProcess

export const buildAgentSpawnCommand = (
  executablePath: string,
  args: readonly string[],
): readonly string[] => [executablePath, ...args]

export const spawnAgentProcess: SpawnAgentProcessFn = ({
  executablePath,
  args,
}) => {
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

  // Drain stderr so a chatty agent cannot stall on a full pipe buffer.
  void (async () => {
    const reader = subprocess.stderr.getReader()
    try {
      while (true) {
        const { done } = await reader.read()
        if (done) {
          return
        }
      }
    } catch {
      // Process exited or the stream was cancelled.
    }
  })()

  return {
    stdin: subprocess.stdin,
    stdout: subprocess.stdout,
    kill: () => {
      subprocess.kill()
    },
    waitForExit: () => subprocess.exited,
  }
}
