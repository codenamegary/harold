/**
 * adb helpers. Taps stay real taps so the recorded slice shows a touch and the
 * renderer keeps its ripple coordinates.
 */

import { execFile, spawn } from "node:child_process"
import type { ChildProcess } from "node:child_process"
import { promisify } from "node:util"

const execFileAsync = promisify(execFile)

function serialArgs(): string[] {
  const serial = process.env.ANDROID_SERIAL
  return serial ? ["-s", serial] : []
}

/**
 * The adb client under WSL2 drops its vsock connection to the emulator now and
 * then, most often right after a boot or while `screenrecord` is writing:
 *
 *     WSL (...) ERROR: UtilAcceptVsock:273: accept4 failed 110
 *
 * That failure is the transport, not the command: the shell never reached the
 * device. Every slice performs ~40 adb calls, so a single hiccup used to abort a
 * whole capture. Only these transport errors are retried, and only these, so a
 * genuine failure (`test -f` on a missing file, a bad tag) still surfaces
 * immediately with its own message.
 */
const TRANSPORT_FAILURE =
  /UtilAcceptVsock|accept4 failed|protocol fault|error: closed|device offline|Connection reset|failed to connect|Broken pipe/

const ADB_ATTEMPTS = 4
const ADB_RETRY_MS = 250

export type AdbOptions = Readonly<{
  /**
   * Retry a transport failure. Never safe for input injection: `adb` can lose
   * the reply after the device already delivered the event, and a blind retry
   * then fires the gesture twice. Callers that must inject input verify the
   * outcome instead and pass `retry: false`.
   */
  retry?: boolean
  /**
   * Abandon the client after this long. The transport can stop answering for
   * tens of seconds while the emulator is loaded, and a key press that blocks
   * that long stretches the calibration blink past its ceiling even though the
   * key itself landed. Callers pass this only where the outcome is verified
   * separately.
   */
  timeoutMs?: number
}>

export async function adb(args: string[], options: AdbOptions = {}): Promise<string> {
  const attempts = options.retry === false ? 1 : ADB_ATTEMPTS
  const attempt = async (remaining: number): Promise<string> => {
    try {
      const { stdout } = await execFileAsync("adb", [...serialArgs(), ...args], {
        maxBuffer: 16 * 1024 * 1024,
        ...(options.timeoutMs === undefined ? {} : { timeout: options.timeoutMs }),
      })
      return stdout.trim()
    } catch (error) {
      const failure = error as { stderr?: string; message: string }
      const message = failure.stderr?.trim() || failure.message
      if (remaining <= 1 || !TRANSPORT_FAILURE.test(message)) {
        throw new Error(`adb ${args.join(" ")} failed: ${message}`)
      }
      await new Promise((done) => setTimeout(done, ADB_RETRY_MS))
      return attempt(remaining - 1)
    }
  }
  return attempt(attempts)
}

export async function forward(port: number): Promise<void> {
  await adb(["forward", `tcp:${port}`, `tcp:${port}`])
}

export async function tap(x: number, y: number): Promise<void> {
  await adb(["shell", "input", "tap", String(Math.round(x)), String(Math.round(y))])
}

export async function swipe(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  durationMs = 300,
): Promise<void> {
  await adb([
    "shell",
    "input",
    "swipe",
    String(Math.round(x1)),
    String(Math.round(y1)),
    String(Math.round(x2)),
    String(Math.round(y2)),
    String(Math.round(durationMs)),
  ])
}

let cachedSize: { width: number; height: number } | null = null

export async function screenSize(): Promise<{ width: number; height: number }> {
  if (cachedSize !== null) {
    return cachedSize
  }
  const output = await adb(["shell", "wm", "size"])
  const match = output.match(/(\d+)x(\d+)/)
  cachedSize = match
    ? { width: Number(match[1]), height: Number(match[2]) }
    : { width: 1080, height: 2400 }
  return cachedSize
}

export async function navigate(route: string, packageId: string): Promise<void> {
  await adb([
    "shell",
    "am",
    "start",
    "-n",
    `${packageId}/harold.android.MainActivity`,
    "--es",
    "debug_navigate",
    route,
  ])
}

export async function launch(
  packageId: string,
  activity = "harold.android.MainActivity",
): Promise<void> {
  await adb(["shell", "am", "start", "-n", `${packageId}/${activity}`])
}

/**
 * The probe prints its port and token on start. Reading them from logcat keeps
 * the token out of build config and out of source.
 */
export async function probeEndpointFromLogcat(
  tag = "HaroldProbe",
): Promise<{ port: number; token: string } | null> {
  const output = await adb(["logcat", "-d", "-s", `${tag}:I`])
  const matches = [...output.matchAll(/listening host=127\.0\.0\.1 port=(\d+) token=([0-9a-f]+)/g)]
  const last = matches.at(-1)
  if (!last) {
    return null
  }
  return { port: Number(last[1]), token: last[2] }
}

/**
 * Start a long running adb shell command and hand back the local process, so a
 * crashed walk can still kill it. `screenrecord` itself is stopped on the device
 * with `pkill -INT`, exactly as the Python driver did.
 */
export function spawnAdb(args: string[]): ChildProcess {
  return spawn("adb", [...serialArgs(), ...args], { stdio: "ignore" })
}

/**
 * Whether a path exists on the device. A failed adb call counts as absent,
 * including one abandoned at `timeoutMs`: a stalled `test -f` must not be read
 * as "the file is coming", because the caller bounds how long the recorder may
 * take by this answer.
 */
export async function fileExists(path: string, timeoutMs?: number): Promise<boolean> {
  try {
    await adb(
      ["shell", "test", "-f", path],
      timeoutMs === undefined ? {} : { timeoutMs },
    )
    return true
  } catch {
    return false
  }
}

export async function pull(remote: string, local: string): Promise<void> {
  await adb(["pull", remote, local])
}

export async function keyevent(code: string): Promise<void> {
  await adb(["shell", "input", "keyevent", code])
}

/**
 * Show a cursor on focus and keep the soft keyboard down.
 * The emulator treats its keyboard as hardware, so the default shows the IME
 * on focus. The walk sends BACK only when a keyboard is actually showing.
 */
export async function suppressSoftKeyboard(): Promise<void> {
  await adb(["shell", "settings", "put", "secure", "show_ime_with_hard_keyboard", "0"])
}

/**
 * Whether the soft keyboard is up. `dumpsys input_method` reports `mInputShown`
 * per client, so any true record means it is showing. Used before sending BACK:
 * a BACK with no keyboard would leave the form instead of closing it.
 */
export async function imeVisible(): Promise<boolean> {
  const output = await adb(["shell", "dumpsys", "input_method"])
  return output.includes("mInputShown=true")
}
