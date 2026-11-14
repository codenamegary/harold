/**
 * MCP client for the probe server. One place that spawns the server over stdio,
 * unwraps a tool result, and closes the transport, shared by the POC and the
 * capture walk.
 *
 * MCP lives on the host on purpose: the APK only exposes a loopback JSON
 * snapshot, so no protocol code ships in the app.
 */

import { Client } from "@modelcontextprotocol/sdk/client/index.js"
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

const SOURCE_DIR = dirname(fileURLToPath(import.meta.url))

/**
 * Must stay above the longest deadline a tool waits for internally, or a
 * legitimate wait turns into the SDK's opaque `Request timed out` before the
 * tool can name what it was waiting for. The driver's longest is a whole agent
 * turn for the build beat (300 s), so the transport budget is larger than that.
 */
const CALL_TIMEOUT_MS = Number(process.env.HAROLD_TOOL_TIMEOUT_MS ?? 360_000)

export type CallTool = (name: string, args?: Record<string, unknown>) => Promise<unknown>

export type ProbeSession = Readonly<{
  callTool: CallTool
  close: () => Promise<void>
}>

/** Env without undefined values, which the transport's `env` option rejects. */
const definedEnv = (env: NodeJS.ProcessEnv): Record<string, string> =>
  Object.fromEntries(
    Object.entries(env).filter((entry): entry is [string, string] => entry[1] !== undefined),
  )

export async function connectProbe(env: NodeJS.ProcessEnv = process.env): Promise<ProbeSession> {
  const token = env.HAROLD_PROBE_TOKEN
  if (!token) {
    throw new Error(
      "HAROLD_PROBE_TOKEN is required. Read it with `adb logcat -d -s HaroldProbe:I`, " +
        "or run it through docs/demo/capture/capture.sh.",
    )
  }

  const transport = new StdioClientTransport({
    command: "bun",
    args: ["run", join(SOURCE_DIR, "server.ts")],
    env: { ...definedEnv(env), HAROLD_PROBE_TOKEN: token },
    stderr: "inherit",
  })

  const client = new Client({ name: "harold-walk", version: "0.1.0" })
  await client.connect(transport)

  const callTool: CallTool = async (name, args = {}) => {
    const response = await client.callTool({ name, arguments: args }, undefined, {
      timeout: CALL_TIMEOUT_MS,
    })
    const content = (response.content ?? []) as Array<{ type: string; text?: string }>
    const text = content.find((item) => item.type === "text")?.text ?? "null"
    if (response.isError) {
      throw new Error(`${name} reported an error: ${text}`)
    }
    return JSON.parse(text)
  }

  return { callTool, close: () => client.close() }
}
