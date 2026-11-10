#!/usr/bin/env bun
/**
 * Proof of concept: add an SSH connection to the real app using only MCP tool
 * calls, while the device records the screen.
 *
 * Every interaction is either a real adb tap resolved from a tag, or typing that
 * runs inside the app. Nothing here reads a uiautomator dump.
 */

import { Client } from "@modelcontextprotocol/sdk/client/index.js"
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js"
import { execFile } from "node:child_process"
import { mkdir, writeFile } from "node:fs/promises"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { promisify } from "node:util"

const execFileAsync = promisify(execFile)

const SOURCE_DIR = dirname(fileURLToPath(import.meta.url))
const OUT_DIR = resolve(
  process.env.HAROLD_POC_OUT ?? join(SOURCE_DIR, "..", "..", "..", "work", "probe-poc"),
)

const SSH_HOST = process.env.HAROLD_DEMO_HOST ?? "127.0.0.1"
const SSH_PORT = process.env.HAROLD_DEMO_SSH_PORT ?? "2223"
const SSH_USER = process.env.HAROLD_DEMO_SSH_USER ?? "gary"
const SSH_CONNECTION_NAME = process.env.HAROLD_DEMO_NAME ?? "demo host"
const CONTAINER = process.env.HAROLD_DEMO_CONTAINER ?? "harold-demo-host"
const TYPE_GAP_MS = Number(process.env.HAROLD_TYPE_GAP_MS ?? 45)

const TOKEN = process.env.HAROLD_PROBE_TOKEN
if (!TOKEN) {
  throw new Error("HAROLD_PROBE_TOKEN is required. Run ./run-poc.sh, or read it from adb logcat -s HaroldProbe:I")
}

type Snapshot = {
  screen: string | null
  settled: boolean
  facts: Record<string, string>
  controls: Array<{ tag: string; x: number; y: number; enabled: boolean }>
}

type Step = { step: string; atMs: number; result: unknown }

const CALL_TIMEOUT_MS = Number(process.env.HAROLD_TOOL_TIMEOUT_MS ?? 180_000)

async function tool<T>(client: Client, name: string, args: Record<string, unknown> = {}): Promise<T> {
  const response = await client.callTool({ name, arguments: args }, undefined, {
    timeout: CALL_TIMEOUT_MS,
  })
  const content = (response.content ?? []) as Array<{ type: string; text?: string }>
  const text = content.find((item) => item.type === "text")?.text ?? "null"
  if (response.isError) {
    throw new Error(`${name} reported an error: ${text}`)
  }
  return JSON.parse(text) as T
}

const sleep = (ms: number) => new Promise((done) => setTimeout(done, ms))

async function main(): Promise<void> {
  await mkdir(OUT_DIR, { recursive: true })

  const environment: Record<string, string> = {
    ...(process.env as Record<string, string>),
    HAROLD_PROBE_TOKEN: TOKEN as string,
  }
  const transport = new StdioClientTransport({
    command: "bun",
    args: ["run", join(SOURCE_DIR, "server.ts")],
    env: environment,
    stderr: "inherit",
  })
  const client = new Client({ name: "harold-poc", version: "0.1.0" })
  await client.connect(transport)

  const startedAt = Date.now()
  const steps: Step[] = []
  const record = async <T>(name: string, run: () => Promise<T>): Promise<T> => {
    const value = await run()
    steps.push({ step: name, atMs: Date.now() - startedAt, result: value })
    console.log(`[${((Date.now() - startedAt) / 1000).toFixed(1)}s] ${name}`)
    return value
  }

  try {
    await record("screen: boot", async () => {
      const snapshot = await tool<Snapshot>(client, "harold_screen")
      console.log(`   probe alive, screen=${snapshot.screen ?? "none"}`)
      return snapshot
    })

    await record("navigate: ssh_setup", () => tool(client, "harold_navigate", { route: "ssh_setup" }))
    await record("marks: clear", () => tool(client, "harold_clear_marks"))

    await record("type: host", () =>
      tool(client, "harold_type", { field: "host", text: SSH_HOST, gapMs: TYPE_GAP_MS }),
    )
    await record("type: user", () =>
      tool(client, "harold_type", { field: "user", text: SSH_USER, gapMs: TYPE_GAP_MS }),
    )
    await record("type: port", () =>
      tool(client, "harold_type", { field: "port", text: SSH_PORT, gapMs: TYPE_GAP_MS }),
    )
    await record("type: name", () =>
      tool(client, "harold_type", { field: "name", text: SSH_CONNECTION_NAME, gapMs: TYPE_GAP_MS }),
    )

    const key = await record("screen: read public key", async () => {
      const snapshot = await tool<Snapshot>(client, "harold_screen")
      const publicKey = snapshot.facts.publicKey ?? ""
      if (!publicKey.startsWith("ssh-")) {
        throw new Error(`app did not expose a public key. facts=${JSON.stringify(snapshot.facts)}`)
      }
      return publicKey
    })
    await record("host: authorize key", async () => {
      await execFileAsync("docker", ["exec", "-i", CONTAINER, "add-authorized-key", key as string])
      return { container: CONTAINER }
    })

    await record("scroll: ssh_test_button", () =>
      tool(client, "harold_scroll_to", { tag: "ssh_test_button" }),
    )
    await record("tap: ssh_test_button", () => tool(client, "harold_tap", { tag: "ssh_test_button" }))
    await record("wait: fingerprint", () => tool(client, "harold_wait", { field: "fingerprint", timeoutMs: 45_000 }))

    await record("scroll: ssh_trust_checkbox", () =>
      tool(client, "harold_scroll_to", { tag: "ssh_trust_checkbox" }),
    )
    await record("tap: ssh_trust_checkbox", () => tool(client, "harold_tap", { tag: "ssh_trust_checkbox" }))
    await record("wait: trusted", () =>
      tool(client, "harold_wait", { field: "trusted", equals: "true", timeoutMs: 10_000 }),
    )

    await record("scroll: ssh_save_button", () =>
      tool(client, "harold_scroll_to", { tag: "ssh_save_button" }),
    )
    await record("tap: ssh_save_button", () => tool(client, "harold_tap", { tag: "ssh_save_button" }))

    const finalScreen = await record("screen: after save", async () => {
      const deadline = Date.now() + 30_000
      let last = ""
      while (Date.now() < deadline) {
        const snapshot = await tool<Snapshot>(client, "harold_screen")
        last = snapshot.screen ?? "(none)"
        if (snapshot.screen !== "ssh_setup") {
          return { screen: snapshot.screen, facts: snapshot.facts }
        }
        await sleep(400)
      }
      throw new Error(`still on ssh_setup after save (last=${last})`)
    })

    const marks = await record("marks: read", () =>
      tool<Array<{ nanos: number; kind: string }>>(client, "harold_marks", { since: 0 }),
    )

    const keyMarks = marks.filter((mark) => mark.kind === "key").length
    const report = {
      startedAt: new Date(startedAt).toISOString(),
      durationMs: Date.now() - startedAt,
      typedCharacters: keyMarks,
      steps,
      finalScreen,
      marks,
    }
    const reportPath = join(OUT_DIR, "report.json")
    await writeFile(reportPath, JSON.stringify(report, null, 2))

    console.log("")
    console.log(`typed ${keyMarks} characters, ${steps.length} tool calls`)
    console.log(`final screen: ${JSON.stringify(finalScreen)}`)
    console.log(`report: ${reportPath}`)
  } finally {
    await client.close()
  }
}

await main()
