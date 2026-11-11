/**
 * The tool surface. Deliberately small: one read, one gesture, one typing verb,
 * and a wait. Anything the video is supposed to show happening goes through
 * harold_tap or harold_type so the recording stays a real interaction.
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import { z } from "zod"
import { navigate, screenSize, swipe, tap } from "./adb"
import {
  anchor,
  clearMarks,
  control,
  intent,
  marks,
  screen,
  type ProbeConfig,
  type ScreenSnapshot,
} from "./probe"

function json(value: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(value, null, 2) }] }
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

function satisfied(snapshot: ScreenSnapshot, field: string, equals?: string): boolean {
  const value = snapshot.facts[field] ?? ""
  if (equals === undefined) {
    return value.length > 0
  }
  return value === equals
}

export function registerProbeTools(server: McpServer, config: ProbeConfig): void {
  const packageId = process.env.HAROLD_PACKAGE ?? "harold.android.debug"

  server.registerTool(
    "harold_screen",
    {
      title: "Read the current screen",
      description:
        "Screen id, state facts, settled flag, and every addressable control with its device-pixel rect. Use this instead of uiautomator dumps.",
      inputSchema: {},
    },
    async () => json(await screen(config)),
  )

  server.registerTool(
    "harold_tap",
    {
      title: "Tap a control by tag",
      description:
        "Resolve a tag to its rect and issue a real adb tap. Returns the coordinates used, so the recording keeps a true touch and ripple.",
      inputSchema: { tag: z.string().describe("Compose test tag, as listed by harold_screen") },
    },
    async ({ tag }) => {
      const snapshot = await screen(config)
      const target = control(snapshot, tag)
      if (!target.enabled) {
        throw new Error(`${tag} is present but disabled`)
      }
      if (target.right - target.left <= 0 || target.bottom - target.top <= 0) {
        throw new Error(`${tag} is off screen (zero bounds). Call harold_scroll_to first.`)
      }
      await tap(target.x, target.y)
      return json({ tag, x: target.x, y: target.y, screen: snapshot.screen })
    },
  )

  server.registerTool(
    "harold_scroll_to",
    {
      title: "Scroll a control into view",
      description:
        "Swipe until the tag reports non-zero bounds. Compose reports an empty rect for an off-screen control, which is the one case where a tag alone is not enough.",
      inputSchema: {
        tag: z.string(),
        direction: z.enum(["down", "up"]).optional(),
        maxSwipes: z.number().int().min(1).max(30).optional(),
      },
    },
    async ({ tag, direction, maxSwipes }) => {
      const limit = maxSwipes ?? 10
      const size = await screenSize()
      const middle = Math.round(size.width / 2)
      for (let attempt = 0; attempt <= limit; attempt += 1) {
        const snapshot = await screen(config)
        const target = snapshot.controls.find((candidate) => candidate.tag === tag)
        if (target && target.right - target.left > 0 && target.bottom - target.top > 0) {
          return json({ tag, x: target.x, y: target.y, swipes: attempt })
        }
        if (direction === "up") {
          await swipe(middle, Math.round(size.height * 0.4), middle, Math.round(size.height * 0.7), 300)
        } else {
          await swipe(middle, Math.round(size.height * 0.7), middle, Math.round(size.height * 0.4), 300)
        }
        await sleep(400)
      }
      throw new Error(`${tag} never came into view after ${limit} swipes`)
    },
  )

  server.registerTool(
    "harold_type",
    {
      title: "Type into a field",
      description:
        "Type character by character inside the app at a fixed gap. The field repaints glyph by glyph and the device records a key mark per character. Clears the field first unless append is true.",
      inputSchema: {
        field: z.string().describe("Field name from the screen facts, e.g. host, user, port"),
        text: z.string(),
        gapMs: z.number().int().min(0).max(500).optional(),
        append: z.boolean().optional(),
      },
    },
    async ({ field, text, gapMs, append }) => {
      const args: Record<string, string> = { field, text }
      if (gapMs !== undefined) {
        args.gapMs = String(gapMs)
      }
      if (append) {
        args.append = "true"
      }
      const result = await intent(config, "type", args)
      const landed = result.facts[field] ?? ""
      const expected = append ? landed : text
      if (!append && landed !== expected) {
        throw new Error(`typed ${JSON.stringify(text)} but the field holds ${JSON.stringify(landed)}`)
      }
      return json({ field, value: landed, marks: result.marks })
    },
  )

  server.registerTool(
    "harold_set",
    {
      title: "Set a field instantly",
      description:
        "Whole-value set with no typing animation. Setup and pre-roll only. Never use it inside a recorded slice.",
      inputSchema: { field: z.string(), value: z.string() },
    },
    async ({ field, value }) => {
      const result = await intent(config, "set", { field, value })
      return json({ field, value: result.facts[field] ?? "" })
    },
  )

  server.registerTool(
    "harold_intent",
    {
      title: "Run a screen action",
      description:
        "Run a named non-gesture action on the current screen, for example test_connection, save, trust, auth_mode.",
      inputSchema: {
        action: z.string(),
        args: z.record(z.string(), z.string()).optional(),
      },
    },
    async ({ action, args }) => json(await intent(config, action, args ?? {})),
  )

  server.registerTool(
    "harold_wait",
    {
      title: "Wait for state",
      description:
        "Block until a fact matches, or until the screen reports settled. Replaces blind sleeps.",
      inputSchema: {
        field: z.string().optional(),
        equals: z.string().optional(),
        settled: z.boolean().optional(),
        timeoutMs: z.number().int().min(0).max(600000).optional(),
        pollMs: z.number().int().min(50).max(5000).optional(),
      },
    },
    async ({ field, equals, settled, timeoutMs, pollMs }) => {
      const deadline = Date.now() + (timeoutMs ?? 45_000)
      const interval = pollMs ?? 400
      let last: ScreenSnapshot | null = null
      while (Date.now() <= deadline) {
        last = await screen(config)
        const factOk = field === undefined ? true : satisfied(last, field, equals)
        const settledOk = settled === undefined ? true : last.settled === settled
        if (factOk && settledOk) {
          return json({ ok: true, screen: last.screen, facts: last.facts })
        }
        await sleep(interval)
      }
      throw new Error(
        `timed out waiting for ${field ?? "settled"}${
          equals === undefined ? "" : `=${equals}`
        }. Last facts: ${JSON.stringify(last?.facts ?? {})}`,
      )
    },
  )

  server.registerTool(
    "harold_navigate",
    {
      title: "Open a screen by route",
      description:
        "Jump straight to a route with an intent. Use it to reach a slice, never for the slice itself.",
      inputSchema: { route: z.enum(["ssh_setup", "chat"]) },
    },
    async ({ route }) => {
      await navigate(route, packageId)
      const deadline = Date.now() + 15_000
      while (Date.now() <= deadline) {
        const snapshot = await screen(config)
        if (snapshot.screen === route) {
          return json({ ok: true, screen: snapshot.screen })
        }
        await sleep(300)
      }
      throw new Error(`navigated to ${route} but the probe never reported that screen`)
    },
  )

  server.registerTool(
    "harold_marks",
    {
      title: "Read device marks",
      description:
        "Marks recorded on the device clock: one key per typed character, keys_done, plus any anchors. Convert to host time through harold_anchor.",
      inputSchema: { since: z.number().int().min(0).optional() },
    },
    async ({ since }) => json(await marks(config, since ?? 0)),
  )

  server.registerTool(
    "harold_clear_marks",
    {
      title: "Clear device marks",
      description: "Drop recorded marks before a new slice.",
      inputSchema: {},
    },
    async () => {
      await clearMarks(config)
      return json({ ok: true })
    },
  )

  server.registerTool(
    "harold_anchor",
    {
      title: "Anchor the device clock",
      description:
        "Sample the device clock. Pair it with a host timestamp taken at the same moment to convert every mark exactly.",
      inputSchema: {},
    },
    async () => json({ anchorNanos: await anchor(config) }),
  )
}
