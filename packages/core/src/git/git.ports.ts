export type GitCommandInput = Readonly<{
  cwd: string
  args: ReadonlyArray<string>
  allowExitCodes?: ReadonlyArray<number>
  timeoutMs?: number
  maxStdoutBytes?: number
}>

export type GitCommandValue = Readonly<{
  exitCode: number
  stdout: string
  stderr: string
  stdoutTruncated: boolean
}>

export type GitCommandFailure = Readonly<{
  kind: "unavailable" | "timeout" | "failed"
  detail: string
}>

export type GitCommandResult =
  | { ok: true; value: GitCommandValue }
  | { ok: false; error: GitCommandFailure }

export type RunGit = (input: GitCommandInput) => Promise<GitCommandResult>
