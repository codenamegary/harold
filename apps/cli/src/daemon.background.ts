import { ReadLiveDaemonState } from "core/daemon-state/read.live.usecase"

const defaultPollIntervalMs = 100
const defaultTimeoutMs = 15_000

export type BackgroundDaemonProcess = Readonly<{
  pid: number
  exited: Promise<number>
  kill: () => void
}>

export type SpawnBackgroundDaemon = () => BackgroundDaemonProcess

export type StartBackgroundDaemonError =
  | { readonly kind: "daemon_exited"; readonly code: number }
  | { readonly kind: "timed_out" }

export type StartBackgroundDaemonResult =
  | { readonly ok: true; readonly value: { readonly pid: number } }
  | { readonly ok: false; readonly error: StartBackgroundDaemonError }

export type StartBackgroundDaemon = () => Promise<StartBackgroundDaemonResult>

export type StartBackgroundDaemonDeps = Readonly<{
  spawn: SpawnBackgroundDaemon
  readLiveDaemonState: ReadLiveDaemonState
  now: () => number
  sleep: (ms: number) => Promise<void>
  pollIntervalMs?: number
  timeoutMs?: number
}>

export type BunSpawnBackgroundDaemonParams = Readonly<{
  execPath: string
  entry: string
  env: Record<string, string | undefined>
}>

/**
 * The daemon is the CLI itself: re-exec the entry with the internal
 * foreground `serve` command. Ignored stdio and `detached` keep it serving
 * after the setup process exits. The child writes diagnostics to its log
 * file, so nothing is lost off screen.
 */
export const makeBunSpawnBackgroundDaemon =
  (params: BunSpawnBackgroundDaemonParams): SpawnBackgroundDaemon =>
  () => {
    const child = Bun.spawn({
      cmd: [params.execPath, params.entry, "serve"],
      stdin: "ignore",
      stdout: "ignore",
      stderr: "ignore",
      detached: true,
      env: params.env,
    })
    child.unref()

    return { pid: child.pid, exited: child.exited, kill: () => child.kill() }
  }

/**
 * Spawns the daemon detached and resolves only when the state file names the
 * spawned pid. Matching the pid proves this child owns the state file, so a
 * daemon that exits leaves a failure instead of a stale-readiness success.
 */
/**
 * One renderer for both commands that spawn the daemon: only the retry
 * command differs (setup reruns the wizard, start reruns the spawn).
 */
export const renderStartDaemonError = (
  error: StartBackgroundDaemonError,
  port: number,
  retryCommand: string,
): string => {
  switch (error.kind) {
    case "daemon_exited":
      return `Harold exited before it was ready (exit code ${error.code}). Check for a process already using port ${port}, then run \`${retryCommand}\` again.`
    case "timed_out":
      return `Timed out waiting for Harold to start. Check \`harold logs\`, then run \`${retryCommand}\` again.`
  }
}

export const makeStartBackgroundDaemon =
  (deps: StartBackgroundDaemonDeps): StartBackgroundDaemon =>
  async (): Promise<StartBackgroundDaemonResult> => {
    const pollIntervalMs = deps.pollIntervalMs ?? defaultPollIntervalMs
    const timeoutMs = deps.timeoutMs ?? defaultTimeoutMs
    const child = deps.spawn()
    const deadline = deps.now() + timeoutMs

    for (;;) {
      const live = deps.readLiveDaemonState()
      if (live.ok && live.state.pid === child.pid) {
        return { ok: true, value: { pid: child.pid } }
      }

      const outcome = await Promise.race([
        child.exited.then((code) => ({ kind: "exited" as const, code })),
        deps.sleep(pollIntervalMs).then(() => ({ kind: "poll" as const })),
      ])

      if (outcome.kind === "exited") {
        return { ok: false, error: { kind: "daemon_exited", code: outcome.code } }
      }

      if (deps.now() >= deadline) {
        child.kill()
        return { ok: false, error: { kind: "timed_out" } }
      }
    }
  }
