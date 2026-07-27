import { AgentProfile } from "./agent-profile"

export type SpawnedAgentProcess = {
  stdin: { write: (chunk: string) => void | number | Promise<void | number> }
  stdout: ReadableStream<Uint8Array>
  kill: () => void
  waitForExit: () => Promise<number | null>
}

export type SpawnAgentProcessFn = (input: {
  profile: AgentProfile
  executablePath: string
}) => SpawnedAgentProcess

export const buildAgentSpawnCommand = (
  profile: AgentProfile,
  executablePath: string,
): readonly string[] => [executablePath, ...profile.command.slice(1)]

export const spawnAgentProcess: SpawnAgentProcessFn = ({ profile, executablePath }) => {
  const cmd = buildAgentSpawnCommand(profile, executablePath)
  const subprocess = Bun.spawn({
    cmd: [...cmd],
    stdin: "pipe",
    stdout: "pipe",
    stderr: "pipe",
  })

  if (!subprocess.stdin || !subprocess.stdout) {
    throw new Error("failed to spawn agent process with stdio pipes")
  }

  return {
    stdin: subprocess.stdin,
    stdout: subprocess.stdout,
    kill: () => {
      subprocess.kill()
    },
    waitForExit: () => subprocess.exited,
  }
}
