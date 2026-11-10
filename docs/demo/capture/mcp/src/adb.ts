/**
 * adb helpers. Taps stay real taps so the recorded slice shows a touch and the
 * renderer keeps its ripple coordinates.
 */

import { execFile } from "node:child_process"
import { promisify } from "node:util"

const execFileAsync = promisify(execFile)

function serialArgs(): string[] {
  const serial = process.env.ANDROID_SERIAL
  return serial ? ["-s", serial] : []
}

export async function adb(args: string[]): Promise<string> {
  try {
    const { stdout } = await execFileAsync("adb", [...serialArgs(), ...args], {
      maxBuffer: 16 * 1024 * 1024,
    })
    return stdout.trim()
  } catch (error) {
    const failure = error as { stderr?: string; message: string }
    throw new Error(`adb ${args.join(" ")} failed: ${failure.stderr?.trim() || failure.message}`)
  }
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
