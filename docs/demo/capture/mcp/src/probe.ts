/**
 * Thin client for the debug control plane inside the app.
 *
 * The app speaks plain JSON over loopback. MCP lives here on the host, so no
 * protocol code ships in the APK and no listener exists in a release build.
 */

export type ProbeControl = {
  tag: string
  left: number
  top: number
  right: number
  bottom: number
  x: number
  y: number
  enabled: boolean
}

export type ProbeMark = {
  nanos: number
  kind: string
}

export type ScreenSnapshot = {
  screen: string | null
  settled: boolean
  actions: string[]
  facts: Record<string, string>
  controls: ProbeControl[]
  marksCount: number
  anchorNanos: number
}

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

export async function health(config: ProbeConfig): Promise<{ ok: boolean; screen: string | null }> {
  return (await call(config, "/health")) as { ok: boolean; screen: string | null }
}

export async function screen(config: ProbeConfig): Promise<ScreenSnapshot> {
  return (await call(config, "/screen")) as ScreenSnapshot
}

export async function intent(
  config: ProbeConfig,
  action: string,
  args: Record<string, string> = {},
): Promise<ScreenSnapshot & { ok: boolean; action: string; marks: ProbeMark[] }> {
  return (await call(config, "/intent", {
    method: "POST",
    body: JSON.stringify({ action, args }),
  })) as ScreenSnapshot & { ok: boolean; action: string; marks: ProbeMark[] }
}

export async function marks(config: ProbeConfig, since = 0): Promise<ProbeMark[]> {
  return (await call(config, `/marks?since=${since}`)) as ProbeMark[]
}

export async function clearMarks(config: ProbeConfig): Promise<void> {
  await call(config, "/marks/clear", { method: "POST" })
}

export async function anchor(config: ProbeConfig): Promise<number> {
  const payload = (await call(config, "/anchor", { method: "POST" })) as { anchorNanos: number }
  return payload.anchorNanos
}

export function control(snapshot: ScreenSnapshot, tag: string): ProbeControl {
  const found = snapshot.controls.find((candidate) => candidate.tag === tag)
  if (!found) {
    const known = snapshot.controls.map((candidate) => candidate.tag).sort().join(", ")
    throw new Error(`no control tagged ${tag}. Known controls: ${known || "(none)"}`)
  }
  return found
}
