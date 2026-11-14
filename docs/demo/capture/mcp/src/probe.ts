/**
 * Thin client for the debug control plane inside the app.
 *
 * The app speaks plain JSON over loopback. MCP lives here on the host, so no
 * protocol code ships in the APK and no listener exists in a release build.
 *
 * Every payload is parsed with Zod before it reaches the driver: the device is a
 * trust boundary, and a silent shape change must fail loudly here instead of
 * becoming a wrong tap coordinate three calls later.
 */

import { z } from "zod"

export const probeControlSchema = z.object({
  tag: z.string(),
  left: z.number(),
  top: z.number(),
  right: z.number(),
  bottom: z.number(),
  x: z.number(),
  y: z.number(),
  enabled: z.boolean(),
})

export type ProbeControl = z.infer<typeof probeControlSchema>

/**
 * One event on the device clock. `nanos` is `SystemClock.elapsedRealtimeNanos()`.
 * The walk stamps `key` rows on the host clock and does not convert these.
 */
export const probeMarkSchema = z.object({
  nanos: z.number(),
  kind: z.string(),
})

export type ProbeMark = z.infer<typeof probeMarkSchema>

export const screenSnapshotSchema = z.object({
  screen: z.string().nullable(),
  settled: z.boolean(),
  actions: z.array(z.string()),
  facts: z.record(z.string(), z.string()),
  controls: z.array(probeControlSchema),
  marksCount: z.number(),
  anchorNanos: z.number(),
})

export type ScreenSnapshot = z.infer<typeof screenSnapshotSchema>

export const intentResultSchema = screenSnapshotSchema.extend({
  ok: z.boolean(),
  action: z.string(),
  marks: z.array(probeMarkSchema),
})

export type IntentResult = z.infer<typeof intentResultSchema>

export const healthSchema = z.object({
  ok: z.boolean(),
  screen: z.string().nullable(),
})

export type ProbeHealth = z.infer<typeof healthSchema>

export type ProbeConfig = {
  baseUrl: string
  token: string
}

export function configFromEnv(env: Record<string, string | undefined> = process.env): ProbeConfig {
  return {
    baseUrl: env.HAROLD_PROBE_URL ?? "http://127.0.0.1:7391",
    token: env.HAROLD_PROBE_TOKEN ?? "",
  }
}

async function call(
  config: ProbeConfig,
  path: string,
  init: RequestInit = {},
): Promise<unknown> {
  const response = await fetch(`${config.baseUrl}${path}`, {
    ...init,
    headers: {
      "content-type": "application/json",
      "x-probe-token": config.token,
      ...(init.headers ?? {}),
    },
  })
  const text = await response.text()
  if (!response.ok) {
    throw new Error(`${init.method ?? "GET"} ${path} failed (${response.status}): ${text}`)
  }
  return text.length === 0 ? null : JSON.parse(text)
}

export async function health(config: ProbeConfig): Promise<ProbeHealth> {
  return healthSchema.parse(await call(config, "/health"))
}

export async function screen(config: ProbeConfig): Promise<ScreenSnapshot> {
  return screenSnapshotSchema.parse(await call(config, "/screen"))
}

export async function intent(
  config: ProbeConfig,
  action: string,
  args: Record<string, string> = {},
): Promise<IntentResult> {
  const payload = await call(config, "/intent", {
    method: "POST",
    body: JSON.stringify({ action, args }),
  })
  return intentResultSchema.parse(payload)
}

export async function marks(config: ProbeConfig, since = 0): Promise<ProbeMark[]> {
  return z.array(probeMarkSchema).parse(await call(config, `/marks?since=${since}`))
}

export async function clearMarks(config: ProbeConfig): Promise<void> {
  await call(config, "/marks/clear", { method: "POST" })
}

export function control(snapshot: ScreenSnapshot, tag: string): ProbeControl {
  const found = snapshot.controls.find((candidate) => candidate.tag === tag)
  if (!found) {
    const known = snapshot.controls.map((candidate) => candidate.tag).sort().join(", ")
    throw new Error(`no control tagged ${tag}. Known controls: ${known || "(none)"}`)
  }
  return found
}
