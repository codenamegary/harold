#!/usr/bin/env bun
/**
 * Proof of concept: add an SSH connection to the real app using only MCP tool
 * calls, while the device records the screen.
 *
 * Every interaction is either a real adb tap resolved from a tag, or typing that
 * runs inside the app. Nothing here reads a uiautomator dump.
 *
 * The client, the tool unwrapping and the transport teardown live in
 * [`client.ts`](./client.ts), shared with the capture walk.
 */

import { execFile } from "node:child_process"
import { mkdir, writeFile } from "node:fs/promises"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { promisify } from "node:util"
import { connectProbe } from "./client"
import { probeMarkSchema, screenSnapshotSchema } from "./probe"
import type { ProbeMark, ScreenSnapshot } from "./probe"

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

type Step = { step: string; atMs: number; result: unknown }

async function main(): Promise<void> {
  await mkdir(OUT_DIR, { recursive: true })

  const probe = await connectProbe()
  const { callTool } = probe

  const startedAt = Date.now()
  const steps: Step[] = []
  const record = async <T>(name: string, run: () => Promise<T>): Promise<T> => {
    const value = await run()
    steps.push({ step: name, atMs: Date.now() - startedAt, result: value })
    console.log(`[${((Date.now() - startedAt) / 1000).toFixed(1)}s] ${name}`)
    return value
  }
  const readScreen = async (): Promise<ScreenSnapshot> =>
    screenSnapshotSchema.parse(await callTool("harold_screen"))

  try {
    await record("screen: boot", async () => {
      const snapshot = await readScreen()
      console.log(`   probe alive, screen=${snapshot.screen ?? "none"}`)
      return snapshot
    })

    await record("navigate: ssh_setup", () => callTool("harold_navigate", { route: "ssh_setup" }))
    await record("marks: clear", () => callTool("harold_clear_marks"))

    await record("type: host", () =>
      callTool("harold_type", { field: "host", text: SSH_HOST, gapMs: TYPE_GAP_MS }),
    )
    await record("type: user", () =>
      callTool("harold_type", { field: "user", text: SSH_USER, gapMs: TYPE_GAP_MS }),
    )
    await record("type: port", () =>
      callTool("harold_type", { field: "port", text: SSH_PORT, gapMs: TYPE_GAP_MS }),
    )
    await record("type: name", () =>
      callTool("harold_type", { field: "name", text: SSH_CONNECTION_NAME, gapMs: TYPE_GAP_MS }),
    )

    const key = await record("screen: read public key", async () => {
      const snapshot = await readScreen()
      const publicKey = snapshot.facts.publicKey ?? ""
      if (!publicKey.startsWith("ssh-")) {
        throw new Error(`app did not expose a public key. facts=${JSON.stringify(snapshot.facts)}`)
      }
      return publicKey
    })
    await record("host: authorize key", async () => {
      await execFileAsync("docker", ["exec", "-i", CONTAINER, "add-authorized-key", key])
      return { container: CONTAINER }
    })

    await record("scroll: ssh_test_button", () =>
      callTool("harold_scroll_to", { tag: "ssh_test_button" }),
    )
    await record("tap: ssh_test_button", () => callTool("harold_tap", { tag: "ssh_test_button" }))
    await record("wait: fingerprint", () =>
      callTool("harold_wait", { field: "fingerprint", timeoutMs: 45_000 }),
    )

    await record("scroll: ssh_trust_checkbox", () =>
      callTool("harold_scroll_to", { tag: "ssh_trust_checkbox" }),
    )
    await record("tap: ssh_trust_checkbox", () =>
      callTool("harold_tap", { tag: "ssh_trust_checkbox" }),
    )
    await record("wait: trusted", () =>
      callTool("harold_wait", { field: "trusted", equals: "true", timeoutMs: 10_000 }),
    )

    await record("scroll: ssh_save_button", () =>
      callTool("harold_scroll_to", { tag: "ssh_save_button" }),
    )
    await record("tap: ssh_save_button", () => callTool("harold_tap", { tag: "ssh_save_button" }))

    const finalScreen = await record("screen: after save", async () => {
      const deadline = Date.now() + 30_000
      const last = { screen: "ssh_setup" as string | null }
      while (Date.now() < deadline) {
        const snapshot = await readScreen()
        last.screen = snapshot.screen
        if (snapshot.screen !== "ssh_setup") {
          return { screen: snapshot.screen, facts: snapshot.facts }
        }
        await new Promise((done) => setTimeout(done, 400))
      }
      throw new Error(`still on ssh_setup after save (last=${last.screen ?? "(none)"})`)
    })

    const marks = await record("marks: read", async () => {
      const raw = await callTool("harold_marks", { since: 0 })
      return (Array.isArray(raw) ? raw : []).map((mark) => probeMarkSchema.parse(mark))
    })

    const typedCharacters = marks.filter((mark) => mark.kind === "key").length
    const report = {
      startedAt: new Date(startedAt).toISOString(),
      durationMs: Date.now() - startedAt,
      typedCharacters,
      steps,
      finalScreen,
      marks,
    }
    const reportPath = join(OUT_DIR, "report.json")
    await writeFile(reportPath, JSON.stringify(report, null, 2))

    console.log("")
    console.log(`typed ${typedCharacters} characters, ${steps.length} tool calls`)
    console.log(`final screen: ${JSON.stringify(finalScreen)}`)
    console.log(`report: ${reportPath}`)
  } finally {
    await probe.close()
  }
}

await main()
