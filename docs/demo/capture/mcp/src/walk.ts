#!/usr/bin/env bun
/**
 * MCP-driven capture walk for the Harold demo story.
 *
 * This replaces the UIAutomator walk in `drive_phone.py`. It drives the app
 * through the probe's MCP tool surface, records one `screenrecord` file per
 * on-camera beat, and writes the same three artifacts `build_capture.py` has
 * always consumed:
 *
 *     slices.json      [{index, name, file, remote, started, ended}]
 *     marks.log        tap | key | sync_wake | <name>, host monotonic at 3 dp
 *     slices/NNN-<name>.mp4
 *
 * plus `walk-report.json` for debugging, in the shape of the POC report.
 *
 * Per slice, in order:
 *
 *   1. `harold_clear_marks`, so the device ledger holds only this slice.
 *   2. An anchor sample (host clock paired with the device clock).
 *   3. `screenrecord` starts, then the head calibration blink: sleep, hold, wake.
 *   4. The beat runs. Taps are real adb taps resolved from a tag; named screen
 *      actions go through `harold_intent`; typing runs inside the app and writes
 *      a `key` mark per character.
 *   5. Another anchor, the tail calibration blink, a final anchor, then the
 *      recorder is stopped and the file is pulled.
 *   6. The device marks are converted to host time through the linear fit of the
 *      anchors, checked against the slice window, and merged with the host rows
 *      in time order.
 *
 * The blink is the contract `build_capture.py` measures: two `sync_wake` rows
 * bracket the slice, each written with the host stamp of the wake, the instant
 * the first frame after the black run appears. That stamp is the published
 * picture's origin (`trimSec = v_end + GUARD`) and the origin every mark is
 * mapped from, so it has to be the wake and not the sleep.
 *
 * Usage:
 *   bun run src/walk.ts --list
 *   bun run src/walk.ts --self-test
 *   HAROLD_PROBE_TOKEN=<from logcat> bun run src/walk.ts --only connect_fill
 */

import { execFileSync } from "node:child_process"
import { appendFileSync, mkdirSync, writeFileSync } from "node:fs"
import { writeFile } from "node:fs/promises"
import { performance } from "node:perf_hooks"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { z } from "zod"
import { adb, fileExists, imeVisible, keyevent, pull, screenSize, spawnAdb, swipe } from "./adb"
import type { ChildProcess } from "node:child_process"
import { BUILD_PROMPT, PLAN_PROMPT, PR_PROMPT } from "./chat.prompts"
import { connectProbe } from "./client"
import type { CallTool } from "./client"
import { clockLimits, fitClock, mapMarks } from "./clock"
import type { AnchorSample, ClockFit, TimedMark } from "./clock"
import {
  assertClosedKeyRuns,
  countKeys,
  deviceMarkRow,
  markRow,
  renderRows,
  sortRows,
  syncWakeRow,
  tapRow,
} from "./marks"
import type { MarkRow } from "./marks"
import { anchorPayloadSchema, intentResultSchema, probeMarkSchema, screenSnapshotSchema } from "./probe"
import type { IntentResult, ProbeControl, ProbeMark, ScreenSnapshot } from "./probe"
import {
  cameraSliceIndex,
  cameraSliceNames,
  parseOnly,
  shouldRecord,
  sliceFileName,
  slicePlan,
} from "./slices"
import type { SliceKind, SliceName } from "./slices"
import { makeProbeStub } from "./stub"

const SOURCE_DIR = dirname(fileURLToPath(import.meta.url))
const DEFAULT_OUT = resolve(join(SOURCE_DIR, "..", "..", "..", "work", "capture"))

const REMOTE_DIR = "/data/local/tmp"
const SCREENRECORD_BIT_RATE = 12_000_000
const SCREENRECORD_TIME_LIMIT_SEC = 300

/**
 * Sleep/wake calibration blink, unchanged from `drive_phone.py`.
 *
 * The hold is the length of the black signal `build_capture.py` measures, and
 * the encoder writes a frame only when the display changes, so 1.2 s produced
 * runs of 0.5-0.7 s on an idle screen. Under load it produced a single frame and
 * the slice failed the two-black-run check, so the hold keeps a margin.
 *
 * The hold is counted from `mWakefulness=Asleep`, not from the key press: see
 * `POWER_SLEEP_TIMEOUT_MS`.
 */
const SYNC_BLACK_HOLD_MS = 1800
const SYNC_WAKE_SETTLE_MS = 600

/**
 * `dumpsys power` is an adb round trip, and while the display is down it is the
 * only load the emulator sees: at 100 ms it starved the encoder enough that a
 * blink arrived as one black frame instead of a run. The poll only has to bound
 * how long a stuck key press goes unnoticed.
 */
const POWER_POLL_MS = 400

/**
 * Tail-blink repaint nudge. `screenrecord` writes a frame only when the display
 * changes, so a static slice (the empty form) had no frame after the wake and
 * its tail black run ended at the recorder flush instead of at the wake. A down
 * swipe then an up swipe forces frames and leaves the scroll position where it
 * was. Both land after the tail blink's black start, which is where the slice is
 * cut, so this motion never reaches the published video.
 */
const BLINK_NUDGE_PX = 220
const BLINK_NUDGE_MS = 300

/**
 * A blink is the black hold, the sleep/wake transitions and the wake settle:
 * 2.4-3.5 s measured here. Ten seconds means the device ignored the sleep or the
 * wake command for a while, which silently corrupts the calibration window.
 */
const MAX_TAIL_BLINK_SEC = 10

/** Anything above this is logged with its per-phase timings. */
const BLINK_WARN_SEC = 5

/** Power-key presses, and how long to wait before deciding one did not land. */
const POWER_KEY_ATTEMPTS = 3
const POWER_RECHECK_MS = 2000
/**
 * The key press is verified by reading the power state, so the client is
 * abandoned rather than left to block: a 20.9 s `input keyevent KEYCODE_SLEEP`
 * reply was measured on this emulator under load, and the key had landed long
 * before it. The blink ceiling is 10 s, so a stalled client must not define it.
 */
const POWER_KEY_TIMEOUT_MS = 4000
/**
 * How long the device may take to reach `Asleep` after `KEYCODE_SLEEP`.
 *
 * `Dozing` is not the same fact as "the display is dark". Measured on this
 * emulator: `mWakefulness=Dozing` arrived 0.08 s after the key press while
 * `mScreenState` stayed `ON` for another 1.8 s, and `screenrecord` kept encoding
 * the still-lit picture through that gap. Counting the black hold from the key
 * press therefore spent the whole hold inside the lit window and left a 0.067 s
 * black run (014-worktrees) that `build_capture.py` correctly rejects. The hold
 * starts from `Asleep`, so a slow display-off transition lengthens the blink
 * instead of eating the black run.
 */
const POWER_SLEEP_TIMEOUT_MS = 6000

/** A raw window this long cannot be trusted even with drift correction. */
const MAX_RAW_SLICE_SEC = 150

/**
 * How long the recorder may take to create its file, and how long one existence
 * probe may take before it is abandoned.
 *
 * Both bound the pre-roll the video carries *before* `started` is stamped, and
 * `build_capture.py` measures exactly that pre-roll: `syncOffsetSec` must stay
 * in (0, 1.5) and the head blink must start inside the first 6 s. A stalled
 * `adb shell test -f` was measured taking 10 s on `007-landing`, which put the
 * black start at 10.867 s and the pre-roll at 9.96 s, so a probe that misses its
 * budget restarts the recorder (which resets the video origin) instead of
 * waiting on an adb reply that may never come.
 *
 * 900 ms also reproduces the old fixed sleep plus one probe, which is what the
 * recorded offsets of 0.15-0.63 s were measured with. Stamping `started` at
 * first sight of the file shaved ~0.3 s and put `connect_empty` at -0.140 s.
 */
const RECORDER_READY_MS = 900
const RECORDER_CHECK_TIMEOUT_MS = 250
const RECORDER_ATTEMPTS = 3
const RECORDER_RETRY_MS = 600
const RECORDER_STOP_POLL_MS = 200
const RECORDER_STOP_TRIES = 20
const RECORDER_FLUSH_MS = 500

/** Poll interval for state waits. Never a fixed wait for a transition. */
const POLL_INTERVAL_MS = 200

/**
 * `build_capture.py` rejects a slice that needs more than 15 clicks per second
 * (2 frames per click at 30 fps). 80 ms per character lands near 12 cps.
 */
const TYPE_GAP_FLOOR_MS = 70

/** Cosmetic holds. Named, because they are the only fixed waits in a slice. */
const DWELL_FORM_MS = 2000
const DWELL_KEY_MS = 2500
const DWELL_FILL_MS = 1200
const DWELL_FINGERPRINT_MS = 2500
const DWELL_TRUST_MS = 2000
const DWELL_SAVE_MS = 600
const DWELL_LANDING_MS = 3000
const DWELL_SESSION_MENU_MS = 1200
const DWELL_SESSION_STARTED_MS = 1500
const DWELL_PLAN_SENT_MS = 800
const DWELL_QUESTION_MS = 1800
const DWELL_ANSWER_MS = 1200
const DWELL_BUILD_SETTLED_MS = 1200
const DWELL_USAGE_MS = 3000
const DWELL_CHANGES_MS = 2000
const DWELL_DIFF_MS = 2500
const DWELL_WORKTREE_MS = 2000
const DWELL_PR_MS = 3000

const SAFE_MARGIN_PX = 40
const FINE_SCROLL_TRIES = 6
const FINE_SCROLL_FRACTION = 0.25

const PROBE_TIMEOUT_MS = 30_000
const FINGERPRINT_TIMEOUT_MS = 60_000
const TRUST_TIMEOUT_MS = 15_000
const SCREEN_CHANGE_TIMEOUT_MS = 30_000

/** The chat screens are agent-paced, so their waits are longer than the form's. */
const CHAT_READY_TIMEOUT_MS = 60_000
const MENU_TIMEOUT_MS = 15_000
const FORM_TIMEOUT_MS = 30_000
const MODE_TIMEOUT_MS = 20_000
const ATTACH_TIMEOUT_MS = 60_000
const QUESTION_TIMEOUT_MS = 180_000
const TURN_TIMEOUT_MS = 300_000
/**
 * How long the question is expected to take on a turn that survived the slice.
 * The demo agent asks it about a second after the prompt lands, so a miss here
 * means the blink took the turn rather than that the agent is slow.
 */
const QUESTION_GRACE_MS = 20_000
/** How long a turn that survived its slice takes to settle before recovery. */
const SETTLE_GRACE_MS = 30_000

export type DemoConfig = Readonly<{
  host: string
  port: string
  user: string
  name: string
  container: string
  typeGapMs: number
  /** The workspace label the new-session form must select. */
  workspace: string
  /** The agent label the new-session form should already show. */
  agent: string
  /** The mode value the plan beat stages, matched case-insensitively. */
  planMode: string
  /** The mode value the build beat stages, matched case-insensitively. */
  buildMode: string
  /** The agent-question option title the question beat selects. */
  answerOption: string
  /** The suffix of the file the changes beat opens, e.g. `settings.js`. */
  diffFile: string
  /** The branches the worktree sheet must list. */
  worktrees: readonly string[]
}>

export type ScrollDirection = "up" | "down"

export type WaitArgs = Readonly<{
  field?: string
  equals?: string
  settled?: boolean
  timeoutMs?: number
}>

export type WaitResult = Readonly<{
  ok: boolean
  screen: string | null
  facts: Record<string, string>
}>

export type SwipeRequest = Readonly<{
  x: number
  fromY: number
  toY: number
  durationMs: number
}>

export type RowSink = Readonly<{
  push: (row: MarkRow) => void
  /** Whether taps are payload for the video, which is only true inside a slice. */
  taps: boolean
}>

export type BeatContext = Readonly<{
  config: DemoConfig
  log: (message: string) => void
  screen: () => Promise<ScreenSnapshot>
  navigate: (route: "ssh_setup" | "chat") => Promise<void>
  tap: (tag: string) => Promise<{ tag: string; x: number; y: number }>
  scrollTo: (tag: string, direction?: ScrollDirection) => Promise<void>
  type: (field: string, text: string) => Promise<void>
  /**
   * Run one named action on the current screen. The declaration in `actions()`
   * is checked before the call, so a beat can only drive what the probe exposes.
   */
  intent: (action: string, args?: Record<string, string>) => Promise<IntentResult>
  /**
   * Type into the chat composer through the probe's own `type` action, so every
   * character leaves a `key` mark in `marks.log`.
   */
  typeComposer: (text: string) => Promise<void>
  wait: (args: WaitArgs) => Promise<WaitResult>
  waitForScreenChange: (from: string, timeoutMs?: number) => Promise<string | null>
  clearMarks: () => Promise<void>
  anchor: () => Promise<AnchorSample>
  dismissKeyboard: () => Promise<void>
  authorizeKey: (publicKey: string) => Promise<void>
  dwell: (ms: number) => Promise<void>
  mark: (name: string) => void
}>

export type ContextDeps = Readonly<{
  call: CallTool
  hostNow: () => number
  log: (message: string) => void
  sleep: (ms: number) => Promise<void>
  sink: RowSink
  config: DemoConfig
  viewport: () => Promise<{ width: number; height: number }>
  swipe: (request: SwipeRequest) => Promise<void>
  dismissKeyboard: () => Promise<void>
  authorizeKey: (publicKey: string) => Promise<void>
}>

export type DeviceControl = Readonly<{
  startRecording: (remote: string) => Promise<void>
  stopRecording: () => Promise<void>
  /**
   * Run one calibration blink and return the host stamp taken before it. The
   * tail blink sets `nudgeAfterWake`: see `BLINK_NUDGE_PX`.
   */
  blink: (options?: BlinkOptions) => Promise<number>
  pull: (remote: string, local: string) => Promise<void>
}>

export type BlinkOptions = Readonly<{
  /**
   * Force a repaint after the screen wakes. `screenrecord` only encodes frames
   * when the display changes, so on a slice whose picture is static (the empty
   * form) the first frame after the wake arrived seconds later, when the
   * recorder flushed, and the tail black run measured the flush instead of the
   * wake. A short swipe is the one input that reliably forces frames; a tap on
   * a non-clickable area does not repaint at all (measured on this emulator:
   * 2 frames for a static screen, 3 for a tap, 10 for a swipe over 8s).
   */
  nudgeAfterWake?: boolean
}>

export type SliceEntry = Readonly<{
  index: number
  name: SliceName
  file: string
  remote: string
  started: number
  ended: number
}>

export type SliceDiagnostics = Readonly<{
  name: SliceName
  index: number
  file: string
  startedSec: number
  endedSec: number
  windowSec: number
  anchors: readonly AnchorSample[]
  fit: ClockFit
  marks: readonly TimedMark[]
}>

export type WalkDeps = Readonly<{
  call: CallTool
  hostNow: () => number
  log: (message: string) => void
  sleep: (ms: number) => Promise<void>
  config: DemoConfig
  device: DeviceControl
  viewport: () => Promise<{ width: number; height: number }>
  swipe: (request: SwipeRequest) => Promise<void>
  dismissKeyboard: () => Promise<void>
  authorizeKey: (publicKey: string) => Promise<void>
  out: Readonly<{ dir: string; slicesDir: string; marksPath: string; manifestPath: string }>
  only: readonly SliceName[]
}>

const tapResultSchema = z.object({
  tag: z.string(),
  x: z.number(),
  y: z.number(),
  screen: z.string().nullable(),
})

const typeResultSchema = z.object({
  field: z.string(),
  value: z.string(),
  marks: z.array(probeMarkSchema),
})

const waitResultSchema = z.object({
  ok: z.boolean(),
  screen: z.string().nullable(),
  facts: z.record(z.string(), z.string()),
})

const failure = (error: unknown): string =>
  error instanceof Error ? error.message : String(error)

const writeRows = (path: string, rows: readonly MarkRow[]): void => {
  if (rows.length === 0) {
    return
  }
  appendFileSync(path, renderRows(rows))
}

// --- Beat context ------------------------------------------------------------

export const makeContext = (deps: ContextDeps): BeatContext => {
  const { call, hostNow, sink, config } = deps

  const screen = async (): Promise<ScreenSnapshot> =>
    screenSnapshotSchema.parse(await call("harold_screen"))

  const describeControls = async (): Promise<string> => {
    const snapshot = await screen()
    return snapshot.controls.map((candidate) => candidate.tag).sort().join(", ") || "(none)"
  }

  /**
   * `harold_scroll_to` stops as soon as a control reports any bounds, and Compose
   * reports bounds for controls that are scrolled entirely past the edge. This
   * nudges with a real swipe until the control sits inside the safe area, and
   * fails with the rect it never reached.
   */
  const nudgeUntilVisible = async (tag: string, attempt: number): Promise<ProbeControl> => {
    const { width, height } = await deps.viewport()
    const target = (await screen()).controls.find((candidate) => candidate.tag === tag)
    if (target === undefined) {
      throw new Error(`no control tagged ${tag}. Known controls: ${await describeControls()}`)
    }
    const inside = target.top >= SAFE_MARGIN_PX && target.bottom <= height - SAFE_MARGIN_PX
    if (inside) {
      return target
    }
    if (attempt >= FINE_SCROLL_TRIES) {
      throw new Error(
        `${tag} never sat fully on screen: rect [${target.left},${target.top}]` +
          `[${target.right},${target.bottom}] in a ${width}x${height} window`,
      )
    }
    const x = Math.round(width / 2)
    const middle = Math.round(height / 2)
    const span = Math.round(height * FINE_SCROLL_FRACTION)
    const shouldMoveDown = (target.top + target.bottom) / 2 < middle
    await deps.swipe({
      x,
      fromY: shouldMoveDown ? middle - span : middle + span,
      toY: shouldMoveDown ? middle + span : middle - span,
      durationMs: 250,
    })
    await deps.sleep(POLL_INTERVAL_MS)
    return nudgeUntilVisible(tag, attempt + 1)
  }

  const scrollTo = async (tag: string, direction: ScrollDirection = "down"): Promise<void> => {
    await call("harold_scroll_to", { tag, direction })
    await nudgeUntilVisible(tag, 0)
  }

  /**
   * `harold_tap` reads a whole `/screen` before it issues `adb shell input tap`,
   * so the touch lands 0.1-0.3 s after the call starts. Stamping the row before
   * the call put the ripple that far ahead of its own tap (measured on
   * agent_server_api34: 171-241 ms over five taps). The stamp is therefore the
   * midpoint of the host clock taken either side of the tool call, which halves
   * the skew without inventing a latency model. The row grammar is unchanged:
   * `tap <mono> <x> <y>`.
   */
  const tap = async (tag: string) => {
    const beforeSec = hostNow()
    const result = tapResultSchema.parse(await call("harold_tap", { tag }))
    const afterSec = hostNow()
    if (sink.taps) {
      sink.push(tapRow({ atSec: (beforeSec + afterSec) / 2, x: result.x, y: result.y }))
    }
    return { tag: result.tag, x: result.x, y: result.y }
  }

  const type = async (field: string, text: string): Promise<void> => {
    const result = typeResultSchema.parse(
      await call("harold_type", { field, text, gapMs: config.typeGapMs }),
    )
    assertClosedKeyRuns(result.marks)
    const keys = countKeys(result.marks)
    if (keys !== [...text].length) {
      throw new Error(
        `${field} emitted ${keys} key marks for ${[...text].length} characters`,
      )
    }
    if (result.value !== text) {
      throw new Error(`${field} holds ${JSON.stringify(result.value)} after typing ${JSON.stringify(text)}`)
    }
  }

  /**
   * The probe's own `actions()` list is the contract. Refusing an undeclared
   * action here turns "the driver invented a verb" into a named failure before
   * the device ever sees it.
   */
  const intent = async (
    action: string,
    args: Record<string, string> = {},
  ): Promise<IntentResult> => {
    const current = await screen()
    if (!current.actions.includes(action)) {
      throw new Error(
        `the ${current.screen ?? "current"} screen does not declare ${action}; it declares ` +
          `${current.actions.join(", ") || "(none)"}`,
      )
    }
    const result = intentResultSchema.parse(await call("harold_intent", { action, args }))
    if (!result.ok) {
      throw new Error(`the ${result.screen ?? "current"} screen refused ${action}`)
    }
    return result
  }

  /**
   * The chat probe's `type` action writes one `key` mark per character and
   * `keys_done` at the end. It ignores `field`, so the fact that carries the
   * text is `composerText`; that is what gets verified.
   */
  const typeComposer = async (text: string): Promise<void> => {
    const result = await intent("type", { text, gapMs: String(config.typeGapMs) })
    assertClosedKeyRuns(result.marks)
    const keys = countKeys(result.marks)
    if (keys !== [...text].length) {
      throw new Error(
        `the composer emitted ${keys} key marks for ${[...text].length} characters`,
      )
    }
    const landed = result.facts.composerText ?? ""
    if (landed !== text) {
      throw new Error(
        `the composer holds ${JSON.stringify(landed)} after typing ${JSON.stringify(text)}`,
      )
    }
  }

  const wait = async (args: WaitArgs): Promise<WaitResult> =>
    waitResultSchema.parse(await call("harold_wait", { ...args }))

  const waitForScreenChange = async (from: string, timeoutMs = SCREEN_CHANGE_TIMEOUT_MS): Promise<string | null> => {
    const deadline = Date.now() + timeoutMs
    const poll = async (): Promise<string | null> => {
      const snapshot = await screen()
      if (snapshot.screen !== from) {
        return snapshot.screen
      }
      if (Date.now() > deadline) {
        throw new Error(`the app never left ${from} within ${timeoutMs} ms`)
      }
      await deps.sleep(POLL_INTERVAL_MS)
      return poll()
    }
    return poll()
  }

  const sleepUntilSettled = async (timeoutMs: number): Promise<void> => {
    const deadline = Date.now() + timeoutMs
    const poll = async (): Promise<void> => {
      if ((await screen()).settled) {
        return
      }
      if (Date.now() > deadline) {
        throw new Error(`the probe never reported settled within ${timeoutMs} ms`)
      }
      await deps.sleep(POLL_INTERVAL_MS)
      return poll()
    }
    return poll()
  }

  return {
    config,
    log: deps.log,
    screen,
    navigate: async (route) => {
      await call("harold_navigate", { route })
    },
    tap,
    scrollTo,
    type,
    intent,
    typeComposer,
    wait,
    waitForScreenChange,
    clearMarks: async () => {
      await call("harold_clear_marks")
    },
    anchor: async () => {
      const before = hostNow()
      const payload = anchorPayloadSchema.parse(await call("harold_anchor"))
      const after = hostNow()
      return { deviceNanos: payload.anchorNanos, hostSec: (before + after) / 2, rttSec: after - before }
    },
    dismissKeyboard: deps.dismissKeyboard,
    authorizeKey: deps.authorizeKey,
    dwell: deps.sleep,
    mark: (name) => {
      sink.push(markRow(name, hostNow()))
    },
  }
}

// --- Beats -------------------------------------------------------------------

export type BeatRun = (ctx: BeatContext) => Promise<void>

const waitForProbe = async (ctx: BeatContext): Promise<ScreenSnapshot> => {
  const deadline = Date.now() + PROBE_TIMEOUT_MS
  const poll = async (): Promise<ScreenSnapshot> => {
    try {
      return await ctx.screen()
    } catch (error) {
      if (Date.now() > deadline) {
        throw new Error(
          `the probe never answered. Check \`adb forward tcp:7391 tcp:7391\` and ` +
            `HAROLD_PROBE_TOKEN. Last error: ${failure(error)}`,
        )
      }
      await ctx.dwell(POLL_INTERVAL_MS)
      return poll()
    }
  }
  return poll()
}

const fillPlan = (config: DemoConfig): readonly Readonly<{ field: string; tag: string; text: string }>[] => [
  { field: "host", tag: "ssh_host_field", text: config.host },
  { field: "user", tag: "ssh_user_field", text: config.user },
  { field: "port", tag: "ssh_port_field", text: config.port },
  { field: "name", tag: "ssh_name_field", text: config.name },
]

const factsOf = async (ctx: BeatContext): Promise<Record<string, string>> =>
  (await ctx.screen()).facts

/** Facts carry lists as `|` separated strings, never as arrays. */
const splitFact = (value: string): readonly string[] =>
  value.length === 0 ? [] : value.split("|")

/**
 * Rebuild a workspace id list from its flat fact. The new-session rows are
 * addressed by a connection-scoped id, `<connectionId>|<rowId>`, and a
 * connection id is an `ssh://user@host:port` URL. A list of those ids therefore
 * carries the same `|` the probe uses to separate list entries, so a plain
 * `splitFact` shreds each id into two. The caller knows how many rows it
 * expects, so the pairing is exact: twice as many fragments as rows means every
 * id is composite, and the fragments pair back up.
 */
export const splitIdFact = (value: string, count: number): readonly string[] => {
  const fragments = splitFact(value)
  if (count <= 0 || fragments.length !== count * 2) {
    return fragments
  }
  const ids: string[] = []
  for (let index = 0; index < fragments.length; index += 2) {
    ids.push(`${fragments[index]}|${fragments[index + 1]}`)
  }
  return ids
}

/**
 * Pair a values fact with its labels fact and return the value whose label
 * matches. Used for the dropdowns, where the driver knows the label the
 * storyboard names but not the host's id.
 */
export const labeledValue = (
  values: readonly string[],
  labels: readonly string[],
  wanted: string,
  what: string,
): string => {
  const index = labels.findIndex((label) => label.toLowerCase() === wanted.toLowerCase())
  if (index < 0) {
    throw new Error(
      `${what} offers ${JSON.stringify(labels)}; none matches ${JSON.stringify(wanted)}`,
    )
  }
  const value = values[index]
  if (value === undefined) {
    throw new Error(`${what} pairs ${labels.length} labels with ${values.length} values`)
  }
  return value
}

/**
 * The mode value the agent offers whose name matches, case-insensitively.
 * `modeOptions` is comma separated; every other list fact uses a pipe.
 */
const modeValueFor = (facts: Record<string, string>, wanted: string): string => {
  const offered = (facts.modeOptions ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter((value) => value.length > 0)
  const match = offered.find((value) => value.toLowerCase() === wanted.toLowerCase())
  if (match === undefined) {
    throw new Error(
      `the agent offers modes ${JSON.stringify(offered)}; ${JSON.stringify(wanted)} is not one of them`,
    )
  }
  return match
}

export type ElicitationChoice = Readonly<{
  questionKey: string
  optionValue: string
  title: string
}>

/**
 * `elicitationOptions` is `questionKey=optionValue:optionTitle` triples, pipe
 * separated. Titles may hold a colon, so the split is at the last one.
 */
export const parseElicitationChoices = (value: string): readonly ElicitationChoice[] =>
  splitFact(value).flatMap((triple) => {
    const equals = triple.indexOf("=")
    const colon = triple.lastIndexOf(":")
    if (equals <= 0 || colon <= equals) {
      return []
    }
    return [
      {
        questionKey: triple.slice(0, equals),
        optionValue: triple.slice(equals + 1, colon),
        title: triple.slice(colon + 1),
      },
    ]
  })

const choiceFor = (facts: Record<string, string>, wanted: string): ElicitationChoice => {
  const offered = parseElicitationChoices(facts.elicitationOptions ?? "")
  const match = offered.find((choice) => choice.title.toLowerCase() === wanted.toLowerCase())
  if (match === undefined) {
    throw new Error(
      `the question offers ${JSON.stringify(offered.map((choice) => choice.title))}; ` +
        `none matches ${JSON.stringify(wanted)}`,
    )
  }
  return match
}

const waitForChatIdle = async (ctx: BeatContext, timeoutMs: number): Promise<void> => {
  await ctx.wait({ field: "sessionId", settled: true, timeoutMs })
  await ctx.wait({ field: "sessionState", equals: "idle", timeoutMs })
}

/**
 * Poll until the screen's facts satisfy a predicate.
 *
 * `harold_wait` can only compare a fact to one exact value, and the create
 * session form loads its workspace list from the host and its agent list from
 * the connection after it mounts, with no fact that flips once and stays. The
 * honest ready signal is the lists themselves, so this waits on a predicate and
 * fails with the last facts it saw.
 */
const waitForFacts = async (
  ctx: BeatContext,
  ready: (facts: Record<string, string>) => boolean,
  timeoutMs: number,
  what: string,
): Promise<Record<string, string>> => {
  const deadline = Date.now() + timeoutMs
  const poll = async (): Promise<Record<string, string>> => {
    const facts = await factsOf(ctx)
    if (ready(facts)) {
      return facts
    }
    if (Date.now() > deadline) {
      throw new Error(
        `${what} never happened within ${timeoutMs} ms; last facts ${JSON.stringify(facts)}`,
      )
    }
    await ctx.dwell(POLL_INTERVAL_MS)
    return poll()
  }
  return poll()
}

/**
 * Re-open the watched session from the header menu.
 *
 * Every on-camera slice is bracketed by a calibration blink, and a blink turns
 * the display off, which backgrounds the app. The app closes a live stream in
 * the background and leaves the chat showing a turn that is no longer running:
 * the composer stays disabled, no question is pending, and `sessionState` reads
 * `running` until the session is re-opened. Re-opening is the documented way
 * back (it is what tapping the session in the menu does): the app reloads the
 * transcript from the host and, because the demo agent keeps an unanswered
 * question on the session, the question comes back with it.
 */
const reopenSession = async (ctx: BeatContext): Promise<void> => {
  const sessionId = (await factsOf(ctx)).sessionId
  if (sessionId.length === 0) {
    throw new Error("the chat has no session to re-open")
  }
  await ctx.intent("open_session_menu")
  const rowTag = (await ctx.screen()).controls
    .map((control) => control.tag)
    .find((tag) => tag.startsWith("session_menu_row_") && tag.endsWith(`:${sessionId}`))
  if (rowTag === undefined) {
    throw new Error(`the session menu holds no row for ${sessionId}`)
  }
  ctx.log(`re-opening ${sessionId} after the blink closed its stream`)
  await ctx.intent("pick_session", { id: rowTag.slice("session_menu_row_".length) })
  await ctx.wait({ field: "sessionId", equals: sessionId, timeoutMs: CHAT_READY_TIMEOUT_MS })
  ctx.mark("session_reopened")
}

/** Wait for a fact, and on a missed grace window re-open the session once. */
const waitOrReopen = async (
  ctx: BeatContext,
  field: string,
  equals: string,
  graceMs: number,
  timeoutMs: number,
): Promise<void> => {
  try {
    await ctx.wait({ field, equals, timeoutMs: graceMs })
    return
  } catch {
    await reopenSession(ctx)
  }
  await ctx.wait({ field, equals, timeoutMs })
}

/** Move the mode chip to `wanted`, which the probe reports as a value fact. */
const stageMode = async (ctx: BeatContext, wanted: string): Promise<string> => {
  const facts = await factsOf(ctx)
  const target = modeValueFor(facts, wanted)
  if (facts.mode === target) {
    return target
  }
  await ctx.intent("set_mode", { value: target })
  await ctx.wait({ field: "mode", equals: target, timeoutMs: MODE_TIMEOUT_MS })
  return target
}

const clearComposer = async (ctx: BeatContext): Promise<void> => {
  await ctx.intent("set_text", { text: "" })
  await ctx.wait({ field: "composerText", equals: "", timeoutMs: MODE_TIMEOUT_MS })
}

/**
 * One runner per slice name. `Record<SliceName, BeatRun>` makes the plan
 * exhaustive: adding a slice to `slices.ts` fails the typecheck until it has a
 * beat here, and the recorder around it never needs to change.
 */
export const beatsBySlice: Record<SliceName, BeatRun> = {
  boot: async (ctx) => {
    ctx.log("waiting for the probe to answer")
    await waitForProbe(ctx)
    ctx.log("navigating to ssh_setup")
    await ctx.navigate("ssh_setup")
    const form = await ctx.screen()
    const publicKey = form.facts.publicKey ?? ""
    if (!publicKey.startsWith("ssh-")) {
      throw new Error(
        `the form did not expose a generated public key (facts=${JSON.stringify(form.facts)})`,
      )
    }
    await ctx.authorizeKey(publicKey)
    ctx.mark("key_authorized")
    ctx.log(`authorized ${publicKey.slice(0, 32)}... on the demo host`)
    // Park the form at its bottom, so the first on-camera beat scrolls up onto
    // the empty fields instead of opening on a static frame.
    await ctx.scrollTo("ssh_save_button")
  },

  connect_empty: async (ctx) => {
    await ctx.scrollTo("ssh_host_field", "up")
    ctx.mark("auth_mode_generate")
    ctx.mark("form_empty")
    await ctx.dwell(DWELL_FORM_MS)
  },

  connect_key: async (ctx) => {
    // `ssh_public_key` is a testTag, not a probe control, so it cannot be the
    // scroll target. The Test connection button sits immediately below the key
    // box and always exists, so scrolling to it frames the key.
    await ctx.scrollTo("ssh_test_button")
    ctx.mark("public_key_visible")
    await ctx.dwell(DWELL_KEY_MS)
  },

  connect_fill: async (ctx) => {
    const plan = fillPlan(ctx.config)
    for (const step of plan) {
      ctx.log(`typing ${step.field}`)
      await ctx.scrollTo(step.tag, "up")
      await ctx.tap(step.tag)
      await ctx.type(step.field, step.text)
      await ctx.dismissKeyboard()
    }
    const snapshot = await ctx.screen()
    const wrong = plan.filter((step) => (snapshot.facts[step.field] ?? "") !== step.text)
    if (wrong.length > 0) {
      throw new Error(
        `the form holds ${JSON.stringify(snapshot.facts)}; expected ` +
          wrong.map((step) => `${step.field}=${JSON.stringify(step.text)}`).join(", "),
      )
    }
    ctx.mark("host_fields_filled")
    await ctx.dwell(DWELL_FILL_MS)
  },

  connect_test: async (ctx) => {
    await ctx.scrollTo("ssh_test_button")
    await ctx.tap("ssh_test_button")
    const result = await ctx.wait({ field: "fingerprint", settled: true, timeoutMs: FINGERPRINT_TIMEOUT_MS })
    const error = result.facts.error ?? ""
    if (error.length > 0) {
      throw new Error(`the connection test reported ${JSON.stringify(error)}`)
    }
    // The fingerprint appears below the Test connection button, off the bottom
    // of the screen: measured on the first green run, the panel's heading was
    // on camera but the SHA256 line itself was cut off. The trust checkbox sits
    // directly under the fingerprint, so scrolling to it frames the whole
    // fingerprint without touching anything.
    await ctx.scrollTo("ssh_trust_checkbox")
    ctx.mark("fingerprint_visible")
    await ctx.dwell(DWELL_FINGERPRINT_MS)
  },

  connect_trust: async (ctx) => {
    await ctx.scrollTo("ssh_trust_checkbox")
    await ctx.tap("ssh_trust_checkbox")
    await ctx.wait({ field: "trusted", equals: "true", timeoutMs: TRUST_TIMEOUT_MS })
    ctx.mark("trusted")
    await ctx.dwell(DWELL_TRUST_MS)
  },

  connect_save: async (ctx) => {
    await ctx.scrollTo("ssh_save_button")
    await ctx.tap("ssh_save_button")
    ctx.mark("save_tapped")
    // Short hold: the app starts leaving the form inside this slice, and the next
    // beat holds on where it lands.
    await ctx.dwell(DWELL_SAVE_MS)
  },

  landing: async (ctx) => {
    const landed = await ctx.waitForScreenChange("ssh_setup")
    ctx.log(`landed on ${landed ?? "(no instrumented screen)"}`)
    ctx.mark("chat_visible")
    await ctx.dwell(DWELL_LANDING_MS)
  },

  /**
   * The `new-session` scene. The session menu, the form and the Start Session
   * tap are all on camera; the workspace and agent picks go through the probe's
   * own actions because the dropdown rows are composable-local and cannot be
   * waited on as controls.
   */
  new_session: async (ctx) => {
    await ctx.wait({ field: "sessionMenuOpen", equals: "false", timeoutMs: MENU_TIMEOUT_MS })
    await ctx.intent("open_session_menu")
    await ctx.wait({ field: "sessionMenuOpen", equals: "true", timeoutMs: MENU_TIMEOUT_MS })
    const menu = await factsOf(ctx)
    const rows = Number(menu.sessionMenuCount ?? "0")
    if (rows < 1) {
      throw new Error(
        `the session menu is empty (sessionMenuCount=${menu.sessionMenuCount ?? "0"}); ` +
          "seed the host session catalog before recording new-session",
      )
    }
    ctx.mark("session_menu_open")
    await ctx.dwell(DWELL_SESSION_MENU_MS)

    await ctx.intent("open_new_session")
    const form = await ctx.waitForScreenChange("chat")
    if (form !== "create_session") {
      throw new Error(
        `New session opened ${form ?? "(no instrumented screen)"} instead of create_session`,
      )
    }
    // The form fetches its workspace list from the host and its agent list from
    // the connection after it mounts, and `settled` only tracks `submitting`, so
    // a bare `settled` wait reads the form before either list has landed.
    const offered = await waitForFacts(
      ctx,
      (facts) => Number(facts.workspaceCount ?? "0") > 0 && Number(facts.agentCount ?? "0") > 0,
      FORM_TIMEOUT_MS,
      "the new-session form offering a workspace and an agent",
    )

    const workspaceLabels = splitFact(offered.workspaceLabels ?? "")
    const workspaceId = labeledValue(
      splitIdFact(offered.workspaceIds ?? "", workspaceLabels.length),
      workspaceLabels,
      ctx.config.workspace,
      "the new-session form",
    )
    await ctx.intent("pick_workspace", { id: workspaceId })
    await ctx.wait({ field: "workspaceId", equals: workspaceId, timeoutMs: FORM_TIMEOUT_MS })
    ctx.mark("workspace_picked")

    // Picking a workspace reloads that connection's agent list, so wait for the
    // refreshed selection before deciding whether the agent needs a nudge.
    await ctx.wait({ field: "agentId", timeoutMs: FORM_TIMEOUT_MS })
    // The storyboard says the agent field already shows the configured agent.
    // The app's default is the first enabled agent, which is not that agent on a
    // fresh install, so the driver sets it only when the form disagrees.
    const selectedAgent = (await factsOf(ctx)).agentLabel ?? ""
    if (selectedAgent.toLowerCase() !== ctx.config.agent.toLowerCase()) {
      const agentId = labeledValue(
        splitFact((await factsOf(ctx)).agentIds ?? ""),
        splitFact((await factsOf(ctx)).agentLabels ?? ""),
        ctx.config.agent,
        "the new-session form",
      )
      await ctx.intent("pick_agent", { agentId })
      await ctx.wait({ field: "agentId", equals: agentId, timeoutMs: FORM_TIMEOUT_MS })
    }

    await ctx.wait({ field: "submitEnabled", equals: "true", timeoutMs: FORM_TIMEOUT_MS })
    await ctx.intent("submit")
    const chat = await ctx.waitForScreenChange("create_session", FORM_TIMEOUT_MS)
    if (chat !== "chat") {
      throw new Error(
        `Start Session landed on ${chat ?? "(no instrumented screen)"} instead of chat`,
      )
    }
    await ctx.wait({ field: "sessionId", settled: true, timeoutMs: CHAT_READY_TIMEOUT_MS })
    ctx.mark("session_started")
    await ctx.dwell(DWELL_SESSION_STARTED_MS)
  },

  /**
   * Stage everything the plan scene assumes. Setting the mode chip and landing
   * the fixture attachments are state changes with no filmable gesture, and the
   * pickers are system UI the probe can never reach, so both are pre-roll only.
   */
  plan_stage: async (ctx) => {
    await waitForChatIdle(ctx, CHAT_READY_TIMEOUT_MS)
    await ctx.wait({ field: "modeOptions", timeoutMs: MODE_TIMEOUT_MS })
    ctx.log(`plan mode is ${await stageMode(ctx, ctx.config.planMode)}`)
    await ctx.intent("attach_fixture")
    await ctx.wait({ field: "attachmentCount", equals: "2", timeoutMs: ATTACH_TIMEOUT_MS })
    ctx.log(`staged attachments: ${(await factsOf(ctx)).attachmentNames ?? "(none)"}`)
    await clearComposer(ctx)
    ctx.mark("plan_staged")
  },

  plan: async (ctx) => {
    await ctx.wait({ field: "attachmentCount", equals: "2", timeoutMs: ATTACH_TIMEOUT_MS })
    await ctx.wait({ field: "composerText", equals: "", timeoutMs: MODE_TIMEOUT_MS })
    ctx.log(`typing the plan prompt, ${[...PLAN_PROMPT].length} characters`)
    await ctx.typeComposer(PLAN_PROMPT)
    await ctx.wait({ field: "composerText", equals: PLAN_PROMPT, timeoutMs: MODE_TIMEOUT_MS })
    await ctx.wait({ field: "sendEnabled", equals: "true", timeoutMs: MODE_TIMEOUT_MS })
    await ctx.intent("send")
    await ctx.wait({ field: "composerText", equals: "", timeoutMs: MODE_TIMEOUT_MS })
    ctx.mark("plan_sent")
    await ctx.dwell(DWELL_PLAN_SENT_MS)
  },

  question_stage: async (ctx) => {
    // No `settled` here on purpose: the probe reports a screen as settled only
    // when no turn is in flight, and a pending question is exactly a turn
    // waiting on the person. Requiring both waits for the answer to its own
    // question and never returns.
    //
    // The question is asked at the end of the `plan` turn, which the `plan`
    // slice's tail blink kills: the blink turns the display off, the app
    // backgrounds, and it closes the stream with the question still open. The
    // grace window separates "the agent is slow" from "the blink ate it"; on a
    // miss the session is re-opened, and the demo agent re-asks what is still
    // unanswered on it.
    await waitOrReopen(
      ctx,
      "elicitationPending",
      "true",
      QUESTION_GRACE_MS,
      QUESTION_TIMEOUT_MS,
    )
    const facts = await factsOf(ctx)
    const questions = Number(facts.elicitationQuestionCount ?? "0")
    if (questions !== 1) {
      throw new Error(
        `the agent asked ${questions} questions; the storyboard allows exactly one`,
      )
    }
    const choices = parseElicitationChoices(facts.elicitationOptions ?? "")
    if (choices.length === 0) {
      throw new Error(
        `the question exposes no choices: ${JSON.stringify(facts.elicitationOptions ?? "")}`,
      )
    }
    ctx.log(`question ready: ${choices.map((choice) => choice.title).join(", ")}`)
    ctx.mark("question_waiting")
  },

  question: async (ctx) => {
    await ctx.wait({ field: "elicitationPending", equals: "true", timeoutMs: MODE_TIMEOUT_MS })
    const wanted = choiceFor(await factsOf(ctx), ctx.config.answerOption)
    ctx.mark("question_card_visible")
    await ctx.dwell(DWELL_QUESTION_MS)

    await ctx.intent("open_elicitation")
    await ctx.wait({ field: "elicitationSheetOpen", equals: "true", timeoutMs: MODE_TIMEOUT_MS })
    ctx.mark("answer_sheet_open")

    await ctx.intent("select_option", {
      questionKey: wanted.questionKey,
      optionValue: wanted.optionValue,
    })
    await ctx.wait({ field: "elicitationDraftValid", equals: "true", timeoutMs: MODE_TIMEOUT_MS })
    await ctx.dwell(DWELL_ANSWER_MS)

    await ctx.intent("submit_elicitation")
    await ctx.wait({ field: "elicitationPending", equals: "false", timeoutMs: MODE_TIMEOUT_MS })
    ctx.mark("answer_submitted")
    await ctx.dwell(DWELL_ANSWER_MS)
  },

  /**
   * The answer resumes the plan turn. Wait for it to finish and for the session
   * to be idle before build mode is staged, so the build slice opens on a
   * composer that accepts input.
   *
   * The `question` slice's tail blink backgrounds the app while that resumed
   * turn may still be streaming, which leaves the chat reporting `running` with
   * nothing in flight. Re-opening the session reloads it and clears the residue.
   */
  build_stage: async (ctx) => {
    await ctx.wait({ field: "elicitationPending", equals: "false", timeoutMs: TURN_TIMEOUT_MS })
    await waitOrReopen(ctx, "sessionState", "idle", SETTLE_GRACE_MS, TURN_TIMEOUT_MS)
    ctx.log(`build mode is ${await stageMode(ctx, ctx.config.buildMode)}`)
    await clearComposer(ctx)
    ctx.mark("build_staged")
  },

  build: async (ctx) => {
    const before = (await factsOf(ctx)).lastAssistantText ?? ""
    ctx.log(`typing the build prompt, ${[...BUILD_PROMPT].length} characters`)
    await ctx.typeComposer(BUILD_PROMPT)
    await ctx.wait({ field: "composerText", equals: BUILD_PROMPT, timeoutMs: MODE_TIMEOUT_MS })
    await ctx.wait({ field: "sendEnabled", equals: "true", timeoutMs: MODE_TIMEOUT_MS })
    await ctx.intent("send")
    await ctx.wait({ field: "composerText", equals: "", timeoutMs: MODE_TIMEOUT_MS })
    ctx.mark("build_sent")
    await ctx.wait({ field: "sessionState", equals: "idle", settled: true, timeoutMs: TURN_TIMEOUT_MS })
    const after = (await factsOf(ctx)).lastAssistantText ?? ""
    if (after.length === 0 || after === before) {
      throw new Error("the build turn settled without a new agent reply")
    }
    ctx.mark("build_settled")
    await ctx.dwell(DWELL_BUILD_SETTLED_MS)
  },

  /**
   * The camera does the work here. The driver only proves the line exists: the
   * script fails the capture when the context and cost line is missing.
   */
  usage: async (ctx) => {
    await ctx.wait({ field: "usage", timeoutMs: TURN_TIMEOUT_MS })
    const facts = await factsOf(ctx)
    if ((facts.usageCost ?? "").length === 0) {
      throw new Error(
        `the context line has no cost: usage=${JSON.stringify(facts.usage ?? "")}`,
      )
    }
    ctx.log(`usage ${facts.usage ?? ""} cost ${facts.usageCost ?? ""}`)
    ctx.mark("usage_visible")
    await ctx.dwell(DWELL_USAGE_MS)
  },

  /**
   * One scene, two instrumented screens: `changes` and `file_diff`. The empty
   * uncommitted scope must be on screen before the branch scope is selected, and
   * the diff must render before the scene is allowed to end.
   */
  changes: async (ctx) => {
    await ctx.intent("open_changes")
    const screen = await ctx.waitForScreenChange("chat")
    if (screen !== "changes") {
      throw new Error(
        `the Changes action opened ${screen ?? "(no instrumented screen)"} instead of changes`,
      )
    }
    await ctx.wait({ field: "loading", equals: "false", settled: true, timeoutMs: FORM_TIMEOUT_MS })
    const uncommitted = await factsOf(ctx)
    if ((uncommitted.scope ?? "") !== "uncommitted" || (uncommitted.empty ?? "") !== "true") {
      throw new Error(
        `Changes opened on ${JSON.stringify(uncommitted.scope)} with ` +
          `${uncommitted.uncommittedCount ?? "?"} dirty files; the storyboard needs the empty scope`,
      )
    }
    ctx.mark("uncommitted_empty")
    await ctx.dwell(DWELL_CHANGES_MS)

    await ctx.intent("select_scope", { value: "branch" })
    await ctx.wait({ field: "scope", equals: "branch", settled: true, timeoutMs: FORM_TIMEOUT_MS })
    const branch = await factsOf(ctx)
    const path = splitFact(branch.filePaths ?? "").find((candidate) =>
      candidate.endsWith(ctx.config.diffFile),
    )
    if (path === undefined) {
      throw new Error(
        `the branch scope holds ${JSON.stringify(branch.filePaths ?? "")}; ` +
          `none ends with ${JSON.stringify(ctx.config.diffFile)}`,
      )
    }
    ctx.mark("branch_files_visible")
    await ctx.dwell(DWELL_CHANGES_MS)

    await ctx.intent("open_file", { path })
    const diffScreen = await ctx.waitForScreenChange("changes")
    if (diffScreen !== "file_diff") {
      throw new Error(
        `opening ${path} showed ${diffScreen ?? "(no instrumented screen)"} instead of file_diff`,
      )
    }
    await ctx.wait({ field: "path", equals: path, settled: true, timeoutMs: FORM_TIMEOUT_MS })
    const diff = await factsOf(ctx)
    if (Number(diff.hunkCount ?? "0") < 1 || Number(diff.lineCount ?? "0") < 1) {
      throw new Error(
        `the diff for ${path} rendered ${diff.hunkCount ?? "0"} hunks and ` +
          `${diff.lineCount ?? "0"} lines`,
      )
    }
    ctx.mark("diff_visible")
    await ctx.dwell(DWELL_DIFF_MS)

    await ctx.intent("back")
    const back = await ctx.waitForScreenChange("file_diff")
    if (back !== "changes") {
      throw new Error(
        `the diff back action returned ${back ?? "(no instrumented screen)"} instead of changes`,
      )
    }
    await ctx.wait({ field: "scope", equals: "branch", settled: true, timeoutMs: FORM_TIMEOUT_MS })
    ctx.mark("back_to_files")
  },

  worktrees: async (ctx) => {
    await ctx.wait({ field: "scope", equals: "branch", settled: true, timeoutMs: FORM_TIMEOUT_MS })
    await ctx.intent("open_worktree_sheet")
    await ctx.wait({ field: "worktreeSheetOpen", equals: "true", timeoutMs: FORM_TIMEOUT_MS })
    const branches = splitFact((await factsOf(ctx)).worktreeBranches ?? "")
    const missing = ctx.config.worktrees.filter((branch) => !branches.includes(branch))
    if (missing.length > 0) {
      throw new Error(
        `the worktree sheet lists ${JSON.stringify(branches)}; it is missing ${missing.join(", ")}`,
      )
    }
    ctx.mark("worktree_sheet_open")
    await ctx.dwell(DWELL_WORKTREE_MS)

    await ctx.intent("dismiss_worktree_sheet")
    await ctx.wait({ field: "worktreeSheetOpen", equals: "false", timeoutMs: FORM_TIMEOUT_MS })
    ctx.mark("worktree_sheet_closed")
  },

  /**
   * `pr` is typed in the chat, so the driver has to leave Changes first. This is
   * pre-roll: the back navigation is plumbing, not picture.
   */
  pr_stage: async (ctx) => {
    if ((await ctx.screen()).screen === "file_diff") {
      await ctx.intent("back")
      await ctx.waitForScreenChange("file_diff", FORM_TIMEOUT_MS)
    }
    if ((await ctx.screen()).screen === "changes") {
      await ctx.intent("back")
      const chat = await ctx.waitForScreenChange("changes", FORM_TIMEOUT_MS)
      if (chat !== "chat") {
        throw new Error(
          `leaving Changes landed on ${chat ?? "(no instrumented screen)"} instead of chat`,
        )
      }
    }
    if ((await ctx.screen()).screen !== "chat") {
      throw new Error(
        `pr_stage needs the chat or Changes screen, found ` +
          `${(await ctx.screen()).screen ?? "(none)"}`,
      )
    }
    await waitForChatIdle(ctx, TURN_TIMEOUT_MS)
    await clearComposer(ctx)
    ctx.mark("pr_staged")
  },

  pr: async (ctx) => {
    const before = (await factsOf(ctx)).lastAssistantText ?? ""
    ctx.log(`typing the PR prompt, ${[...PR_PROMPT].length} characters`)
    await ctx.typeComposer(PR_PROMPT)
    await ctx.wait({ field: "composerText", equals: PR_PROMPT, timeoutMs: MODE_TIMEOUT_MS })
    await ctx.wait({ field: "sendEnabled", equals: "true", timeoutMs: MODE_TIMEOUT_MS })
    await ctx.intent("send")
    await ctx.wait({ field: "composerText", equals: "", timeoutMs: MODE_TIMEOUT_MS })
    ctx.mark("pr_sent")
    await ctx.wait({ field: "sessionState", equals: "idle", settled: true, timeoutMs: TURN_TIMEOUT_MS })
    const reply = (await factsOf(ctx)).lastAssistantText ?? ""
    if (reply === before || !reply.includes("https://github.com")) {
      throw new Error(`the agent reply holds no PR URL: ${JSON.stringify(reply)}`)
    }
    ctx.log(`PR URL: ${reply}`)
    ctx.mark("pr_url_visible")
    await ctx.dwell(DWELL_PR_MS)
  },
}

export type Beat = Readonly<{ name: SliceName; kind: SliceKind; run: BeatRun }>

/**
 * The plan and its runners zipped into one list, which is the only thing the
 * driver and the tests walk. `slices.ts` owns the names and kinds, `beatsBySlice`
 * owns the code, and adding a beat touches neither recording nor sync.
 */
export const BEATS: readonly Beat[] = slicePlan.map((spec) => ({
  name: spec.name,
  kind: spec.kind,
  run: beatsBySlice[spec.name],
}))

// --- Device control ----------------------------------------------------------

const screenrecordRunning = async (): Promise<boolean> => {
  try {
    await adb(["shell", "pidof", "screenrecord"])
    return true
  } catch {
    return false
  }
}

/**
 * Read the power state, or `""` when the read failed.
 *
 * Every caller is a poll with its own deadline, so a transport hiccup must not
 * abort the slice: `adb shell dumpsys power` was measured failing four times in
 * a row with `UtilAcceptVsock: accept4 failed 110` (the WSL vsock drop the adb
 * helpers already retry) and that killed a capture on `010-question`. An empty
 * answer reads as "not in the wanted state yet" and the poll simply tries again.
 */
const wakefulness = async (): Promise<string> => {
  let output = ""
  try {
    output = await adb(["shell", "dumpsys", "power"])
  } catch {
    return ""
  }
  const line = output.split("\n").find((candidate) => candidate.trim().startsWith("mWakefulness="))
  return line === undefined ? "" : line.trim().slice("mWakefulness=".length).trim()
}

const waitForPowerState = async (wanted: readonly string[], timeoutMs = 5000): Promise<void> => {
  const deadline = Date.now() + timeoutMs
  const poll = async (): Promise<void> => {
    const state = await wakefulness()
    if (wanted.includes(state)) {
      return
    }
    if (Date.now() > deadline) {
      throw new Error(
        `the device never reached power state ${wanted.join("/")} (stuck at ` +
          `${JSON.stringify(state)}); the sync blink cannot be trusted`,
      )
    }
    await new Promise((done) => setTimeout(done, POWER_POLL_MS))
    return poll()
  }
  return poll()
}

/** Whether the device reaches one of these power states within the window. */
const powerStateWithin = async (wanted: readonly string[], timeoutMs: number): Promise<boolean> => {
  const deadline = Date.now() + timeoutMs
  const poll = async (): Promise<boolean> => {
    if (wanted.includes(await wakefulness())) {
      return true
    }
    if (Date.now() > deadline) {
      return false
    }
    await new Promise((done) => setTimeout(done, 100))
    return poll()
  }
  return poll()
}

/**
 * Press a power key and prove it landed.
 *
 * The key is injected without adb's transport retry on purpose. adb can lose the
 * reply *after* the device already acted, and a blind retry presses the key a
 * second time: a second SLEEP stretches the black run seconds past the hold, and
 * a second WAKEUP stamps the wake seconds away from the frame it belongs to.
 * Both corrupt the calibration `build_capture.py` measures. So a failed call is
 * followed by a state check, and only a device that did not change state is
 * pressed again.
 */
const powerKey = async (
  code: string,
  wanted: readonly string[],
  timeoutMs = 5000,
): Promise<void> => {
  const attempt = async (remaining: number): Promise<void> => {
    try {
      await adb(["shell", "input", "keyevent", code], {
        retry: false,
        timeoutMs: POWER_KEY_TIMEOUT_MS,
      })
    } catch (error) {
      if (await powerStateWithin(wanted, POWER_RECHECK_MS)) {
        return
      }
      if (remaining <= 1) {
        throw error
      }
      return attempt(remaining - 1)
    }
  }
  await attempt(POWER_KEY_ATTEMPTS)
  await waitForPowerState(wanted, timeoutMs)
}

/** Wake the screen and return the host stamp of the wake itself. */
const wakeWithStamp = async (): Promise<number> => {
  const attempt = async (remaining: number): Promise<number> => {
    try {
      await adb(["shell", "input", "keyevent", "KEYCODE_WAKEUP"], {
        retry: false,
        timeoutMs: POWER_KEY_TIMEOUT_MS,
      })
      return performance.now() / 1000
    } catch (error) {
      if (await powerStateWithin(["Awake"], POWER_RECHECK_MS)) {
        return performance.now() / 1000
      }
      if (remaining <= 1) {
        throw error
      }
      return attempt(remaining - 1)
    }
  }
  const stamp = await attempt(POWER_KEY_ATTEMPTS)
  await waitForPowerState(["Awake"])
  return stamp
}

/**
 * Wait until the app's window owns input focus.
 *
 * A tap issued while the window is still resuming after the display wakes is
 * delivered to nobody, which costs a whole beat: the tap on `Test connection`
 * produced no fingerprint and no error, because the touch never reached the
 * button. The blink ends by waking the screen, so it also owns this wait.
 */
const waitForAppFocus = async (packageId: string, timeoutMs = 5000): Promise<void> => {
  const deadline = Date.now() + timeoutMs
  const poll = async (): Promise<void> => {
    const output = await adb(["shell", "dumpsys", "window"]).catch(() => "")
    if (output.includes(`mCurrentFocus=Window`) && output.includes(packageId)) {
      return
    }
    if (Date.now() > deadline) {
      throw new Error(`the ${packageId} window never took input focus after the wake`)
    }
    await new Promise((done) => setTimeout(done, POWER_POLL_MS))
    return poll()
  }
  return poll()
}

export const makeDeviceControl = (deps?: Readonly<{ log?: (message: string) => void }>): DeviceControl => {
  const children: ChildProcess[] = []
  const log = deps?.log ?? (() => {})
  const packageId = process.env.HAROLD_PACKAGE ?? "harold.android.debug"

  /** Force a repaint after a blink, then put the scroll position back. */
  const nudge = async (): Promise<void> => {
    const { width, height } = await screenSize()
    const x = Math.round(width / 2)
    const from = Math.round(height * 0.5)
    const to = from - BLINK_NUDGE_PX
    await swipe(x, from, x, to, BLINK_NUDGE_MS)
    await swipe(x, to, x, from, BLINK_NUDGE_MS)
  }

  return {
    startRecording: async (remote) => {
      const attempt = async (remaining: number): Promise<void> => {
        if (remaining <= 0) {
          throw new Error(`screenrecord never created ${remote}`)
        }
        children.push(
          spawnAdb([
            "shell",
            "screenrecord",
            "--bit-rate",
            String(SCREENRECORD_BIT_RATE),
            "--time-limit",
            String(SCREENRECORD_TIME_LIMIT_SEC),
            remote,
          ]),
        )
        const spawnedAt = Date.now()
        const deadline = spawnedAt + RECORDER_READY_MS
        const poll = async (): Promise<boolean> => {
          if (await fileExists(remote, RECORDER_CHECK_TIMEOUT_MS)) {
            return true
          }
          if (Date.now() > deadline) {
            return false
          }
          await new Promise((done) => setTimeout(done, RECORDER_STOP_POLL_MS))
          return poll()
        }
        if (await poll()) {
          // Keep the ready window whole. `started` is stamped right after this
          // returns, and `build_capture.py` measures it against the video origin
          // as `syncOffsetSec` in (0, 1.5): stamping it as soon as the file
          // appeared shaved ~0.3 s off every slice and put `connect_empty` at
          // -0.140 s. The window is only *shortened* when a probe overran it.
          const remaining = RECORDER_READY_MS - (Date.now() - spawnedAt)
          if (remaining > 0) {
            await new Promise((done) => setTimeout(done, remaining))
          }
          return
        }
        // The file has to go before the retry: otherwise the next probe sees the
        // *previous* recorder's file and reports ready while the new recorder is
        // still starting, which stamps `started` before the video origin.
        await adb(["shell", "pkill", "-INT", "screenrecord"]).catch(() => "")
        await adb(["shell", "rm", "-f", remote]).catch(() => "")
        await new Promise((done) => setTimeout(done, RECORDER_RETRY_MS))
        return attempt(remaining - 1)
      }
      return attempt(RECORDER_ATTEMPTS)
    },
    stopRecording: async () => {
      if (await screenrecordRunning()) {
        await adb(["shell", "pkill", "-INT", "screenrecord"])
      }
      const poll = async (remaining: readonly number[]): Promise<void> => {
        if (remaining.length === 0 || !(await screenrecordRunning())) {
          return
        }
        await new Promise((done) => setTimeout(done, RECORDER_STOP_POLL_MS))
        return poll(remaining.slice(1))
      }
      await poll(Array.from({ length: RECORDER_STOP_TRIES }, (_, index) => index))
      await new Promise((done) => setTimeout(done, RECORDER_FLUSH_MS))
      for (const child of children.splice(0)) {
        child.kill("SIGINT")
      }
    },
    blink: async (options) => {
      // Every phase is timed, because one slow phase stretches the black run
      // and distorts the window `build_capture.py` divides by. A normal blink is
      // 2.4-3.5 s end to end on this emulator.
      const blinkStartedSec = performance.now() / 1000
      const phases: string[] = []
      const phase = async (name: string, run: () => Promise<unknown>): Promise<void> => {
        const before = performance.now() / 1000
        await run()
        phases.push(`${name} ${((performance.now() / 1000 - before) * 1000).toFixed(0)}ms`)
      }
      // The key press only has to prove it landed, which `Dozing` does. Waiting
      // for `Asleep` inside `powerKey` re-pressed the key on a slow transition
      // and cost a 4 s timeout per attempt (25.9 s measured on `new_session`),
      // so the real dark state is waited for separately, once.
      await phase("sleep", () => powerKey("KEYCODE_SLEEP", ["Asleep", "Dozing"]))
      // `Asleep` only: Dozing arrives ~1.8 s before the display is actually dark
      // on this emulator (see `POWER_SLEEP_TIMEOUT_MS`), and a hold started there
      // records the lit UI instead of a black run.
      await phase("dark", () => waitForPowerState(["Asleep"], POWER_SLEEP_TIMEOUT_MS))
      await new Promise((done) => setTimeout(done, SYNC_BLACK_HOLD_MS))
      // The stamp is the wake, not the sleep. `build_capture.py` anchors the
      // published picture to the *end* of each black run (`trimSec = v_end_1 +
      // GUARD`) and maps every mark from the same stamp, so the stamp has to be
      // the instant the first post-black frame appears. Stamping before
      // KEYCODE_SLEEP put every mark 0.7-0.9 s late, and the last mark of the
      // slice then mapped past the published duration.
      let stamp = 0
      await phase("wake", async () => {
        stamp = await wakeWithStamp()
      })
      await phase("keyguard", () => adb(["shell", "wm", "dismiss-keyguard"]))
      await phase("focus", () => waitForAppFocus(packageId))
      if (options?.nudgeAfterWake === true) {
        await phase("nudge", () => nudge())
      }
      await new Promise((done) => setTimeout(done, SYNC_WAKE_SETTLE_MS))
      const blinkSec = performance.now() / 1000 - blinkStartedSec
      if (blinkSec > BLINK_WARN_SEC) {
        // A long blink is a long black run, and the drift between the video
        // clock and the driver clock then grows on both ends of it, which is
        // what pushes `syncOffsetSec` out of range later.
        log(`blink took ${blinkSec.toFixed(2)}s (${phases.join(", ")})`)
      }
      return stamp
    },
    pull: (remote, local) => pull(remote, local),
  }
}

// --- Recording ---------------------------------------------------------------

const readDeviceMarks = async (call: CallTool): Promise<readonly ProbeMark[]> =>
  z.array(probeMarkSchema).parse(await call("harold_marks", { since: 0 }))

const recordSlice = async (params: Readonly<{
  beat: Beat
  deps: WalkDeps
}>): Promise<Readonly<{ entry: SliceEntry; diagnostics: SliceDiagnostics; deviceMarks: readonly ProbeMark[] }>> => {
  const { beat, deps } = params
  const index = cameraSliceIndex(beat.name)
  const file = sliceFileName(beat.name)
  const remote = `${REMOTE_DIR}/harold-demo-${file}`
  const rows: MarkRow[] = []
  const timing = { endedSec: 0, tailBlinkSec: 0 }

  await deps.call("harold_clear_marks")
  const anchors: AnchorSample[] = []
  const ctx = makeContext({
    call: deps.call,
    hostNow: deps.hostNow,
    log: deps.log,
    sleep: deps.sleep,
    sink: { push: (row) => rows.push(row), taps: true },
    config: deps.config,
    viewport: deps.viewport,
    swipe: deps.swipe,
    dismissKeyboard: deps.dismissKeyboard,
    authorizeKey: deps.authorizeKey,
  })
  anchors.push(await ctx.anchor())

  deps.log(`slice ${beat.name}: recording ${file}`)

  // `started` is the host instant the recorder is live, which is what
  // `build_capture.py` pairs with the video's first frame. Stamping it before
  // the recorder had started put it ~0.85 s early (the recorder-ready wait) and
  // drove `syncOffsetSec` negative.
  await deps.device.startRecording(remote)
  const startedSec = deps.hostNow()
  try {
    rows.push(syncWakeRow(await deps.device.blink()))
    // `slice_start` marks the first moment of the slice's *picture*, which is
    // the head blink's wake, not the recording start. Stamping it before the
    // blink put it before the published window, and `build_capture.py` maps
    // every non-sync_wake row inside `started..ended` to a published time, so
    // it rejected the row as negative and failed the whole build.
    rows.push(markRow(`slice_start_${beat.name}`, deps.hostNow()))
    anchors.push(await ctx.anchor())
    await beat.run(ctx)
    anchors.push(await ctx.anchor())
    rows.push(markRow(`slice_end_${beat.name}`, deps.hostNow()))
    const tailBlinkStartedSec = deps.hostNow()
    rows.push(syncWakeRow(await deps.device.blink({ nudgeAfterWake: true })))
    timing.endedSec = deps.hostNow()
    // A tail blink that takes far longer than the hold plus settle means the
    // device fought the sleep/wake cycle; it is named here because it inflates
    // the calibration window that `build_capture.py` divides by.
    timing.tailBlinkSec = timing.endedSec - tailBlinkStartedSec
    if (timing.tailBlinkSec > MAX_TAIL_BLINK_SEC) {
      throw new Error(
        `slice ${beat.name}: the tail blink took ${timing.tailBlinkSec.toFixed(2)}s, above ` +
          `the ${MAX_TAIL_BLINK_SEC}s ceiling; the screen did not sleep or wake when asked`,
      )
    }
  } catch (error) {
    throw new Error(`slice ${beat.name}: ${failure(error)}`)
  } finally {
    await deps.device.stopRecording()
  }

  const endedSec = timing.endedSec
  const windowSec = endedSec - startedSec
  if (windowSec > MAX_RAW_SLICE_SEC) {
    throw new Error(
      `slice ${beat.name} recorded for ${windowSec.toFixed(1)}s, above the ` +
        `${MAX_RAW_SLICE_SEC}s cap; split the beat into shorter slices`,
    )
  }
  if (windowSec < 1) {
    throw new Error(
      `slice ${beat.name} recorded for ${windowSec.toFixed(3)}s; the blink brackets ` +
        `are missing, so no calibration pair exists`,
    )
  }

  anchors.push(await ctx.anchor())
  const deviceMarks = await readDeviceMarks(deps.call)
  assertClosedKeyRuns(deviceMarks)
  const fit = fitClock(anchors)
  const timed = mapMarks(deviceMarks, fit, { startedSec, endedSec })
  for (const mark of timed) {
    rows.push(deviceMarkRow(mark.kind, mark.hostSec))
  }
  writeRows(deps.out.marksPath, sortRows(rows))
  await deps.device.pull(remote, join(deps.out.slicesDir, file))

  deps.log(
    `slice ${beat.name}: ${windowSec.toFixed(2)}s raw (tail blink ` +
      `${timing.tailBlinkSec.toFixed(2)}s), ${timed.length} device marks, ` +
      `slope ${fit.slope.toFixed(6)}, residual ${(fit.residualSec * 1000).toFixed(1)} ms`,
  )

  const entry: SliceEntry = { index, name: beat.name, file, remote, started: startedSec, ended: endedSec }
  const diagnostics: SliceDiagnostics = {
    name: beat.name,
    index,
    file,
    startedSec,
    endedSec,
    windowSec,
    anchors,
    fit,
    marks: timed,
  }
  return { entry, diagnostics, deviceMarks }
}

// --- Walk --------------------------------------------------------------------

export type Step = Readonly<{ step: string; atMs: number; result: unknown }>

export type WalkReport = Readonly<{
  startedAt: string
  durationMs: number
  typedCharacters: number
  steps: readonly Step[]
  finalScreen: Readonly<{ screen: string | null; facts: Record<string, string> }>
  marks: readonly ProbeMark[]
  slices: readonly SliceDiagnostics[]
}>

export const runWalk = async (deps: WalkDeps): Promise<WalkReport> => {
  const startedAt = Date.now()
  const startedIso = new Date(startedAt).toISOString()
  const entries: SliceEntry[] = []
  const diagnostics: SliceDiagnostics[] = []
  const steps: Step[] = []
  const allDeviceMarks: ProbeMark[] = []

  const unrecorded = makeContext({
    call: deps.call,
    hostNow: deps.hostNow,
    log: deps.log,
    sleep: deps.sleep,
    sink: { push: (row) => writeRows(deps.out.marksPath, [row]), taps: false },
    config: deps.config,
    viewport: deps.viewport,
    swipe: deps.swipe,
    dismissKeyboard: deps.dismissKeyboard,
    authorizeKey: deps.authorizeKey,
  })

  deps.log(`driver_start${deps.only.length > 0 ? ` only=${deps.only.join(",")}` : ""}`)

  for (const beat of BEATS) {
    const recording = beat.kind === "onCamera" && shouldRecord(beat.name, deps.only)

    if (!recording) {
      await beat.run(unrecorded).catch((error: unknown) => {
        throw new Error(`beat ${beat.name}: ${failure(error)}`)
      })
      steps.push({ step: `${beat.kind}:${beat.name}`, atMs: Date.now() - startedAt, result: { recorded: false } })
      continue
    }

    const slice = await recordSlice({ beat, deps })
    entries.push(slice.entry)
    diagnostics.push(slice.diagnostics)
    allDeviceMarks.push(...slice.deviceMarks)
    await writeFile(deps.out.manifestPath, `${JSON.stringify(entries, null, 2)}\n`)
    steps.push({
      step: `onCamera:${beat.name}`,
      atMs: Date.now() - startedAt,
      result: {
        recorded: true,
        file: slice.entry.file,
        windowSec: Number(slice.diagnostics.windowSec.toFixed(3)),
        slope: Number(slice.diagnostics.fit.slope.toFixed(6)),
        residualMs: Number((slice.diagnostics.fit.residualSec * 1000).toFixed(1)),
      },
    })

    if (deps.only.length > 0 && diagnostics.length === deps.only.length) {
      deps.log(`--only satisfied after slice ${beat.name}`)
      break
    }
  }

  const final = await deps.call("harold_screen")
  const finalScreen = screenSnapshotSchema.parse(final)

  return {
    startedAt: startedIso,
    durationMs: Date.now() - startedAt,
    typedCharacters: countKeys(allDeviceMarks),
    steps,
    finalScreen: { screen: finalScreen.screen, facts: finalScreen.facts },
    marks: allDeviceMarks,
    slices: diagnostics,
  }
}

// --- CLI ---------------------------------------------------------------------

export type Cli = Readonly<{
  list: boolean
  selfTest: boolean
  help: boolean
  out: string
  serial: string | undefined
  only: readonly SliceName[]
}>

type CliDraft = Readonly<{
  list: boolean
  selfTest: boolean
  help: boolean
  out: string
  serial: string | undefined
  onlyValues: readonly string[]
}>

const initialCli: CliDraft = { list: false, selfTest: false, help: false, out: DEFAULT_OUT, serial: undefined, onlyValues: [] }

export const parseArgs = (argv: readonly string[]): Cli => {
  const consume = (rest: readonly string[], draft: CliDraft): CliDraft => {
    const [head, ...tail] = rest
    if (head === undefined) {
      return draft
    }
    if (head === "--list") {
      return consume(tail, { ...draft, list: true })
    }
    if (head === "--self-test") {
      return consume(tail, { ...draft, selfTest: true })
    }
    if (head === "-h" || head === "--help") {
      return consume(tail, { ...draft, help: true })
    }
    if (head === "--out" || head === "--emulator-serial" || head === "--only") {
      const [value, ...more] = tail
      if (value === undefined || value.startsWith("--")) {
        throw new Error(`${head} needs a value`)
      }
      if (head === "--only") {
        return consume(more, { ...draft, onlyValues: [...draft.onlyValues, value] })
      }
      return head === "--out"
        ? consume(more, { ...draft, out: resolve(value) })
        : consume(more, { ...draft, serial: value })
    }
    if (head.startsWith("--only=")) {
      return consume(tail, { ...draft, onlyValues: [...draft.onlyValues, head.slice("--only=".length)] })
    }
    if (head.startsWith("--out=")) {
      return consume(tail, { ...draft, out: resolve(head.slice("--out=".length)) })
    }
    if (head.startsWith("--emulator-serial=")) {
      return consume(tail, { ...draft, serial: head.slice("--emulator-serial=".length) })
    }
    throw new Error(`unknown argument ${head}; run with --list or --help`)
  }

  const draft = consume(argv, initialCli)
  const only = draft.onlyValues.length > 0 ? parseOnly(draft.onlyValues) : []
  return { list: draft.list, selfTest: draft.selfTest, help: draft.help, out: draft.out, serial: draft.serial, only }
}

const usage = (): string =>
  [
    "usage: bun run src/walk.ts [options]",
    "",
    "  --list                    print the beat plan and exit",
    "  --only <a,b>              record only these slices; repeatable",
    "  --self-test               check beats, marks and clock math with no device",
    "  --out <dir>               output directory (default docs/demo/work/capture)",
    "  --emulator-serial <sn>    adb serial to drive",
    "",
    "recorded slices:",
    ...cameraSliceNames.map((name) => `  ${sliceFileName(name)}`),
  ].join("\n")

const printPlan = (): void => {
  console.log(
    slicePlan
      .map((spec) => {
        const marker = spec.kind === "preRoll" ? "-" : `${String(cameraSliceIndex(spec.name)).padStart(3, "0")}`
        return `${marker}  ${spec.name.padEnd(16)} ${spec.kind.padEnd(9)} ${spec.title}`
      })
      .join("\n"),
  )
}

const envList = (value: string | undefined, fallback: readonly string[]): readonly string[] => {
  const source = value === undefined ? fallback : value.split(",")
  const cleaned = source.map((item) => item.trim()).filter((item) => item.length > 0)
  return cleaned.length > 0 ? cleaned : fallback
}

const configFromEnv = (): DemoConfig => {
  const gap = Number(process.env.HAROLD_TYPE_GAP_MS ?? 80)
  const typeGapMs = Number.isFinite(gap) && gap >= TYPE_GAP_FLOOR_MS ? gap : TYPE_GAP_FLOOR_MS
  return {
    host: process.env.HAROLD_DEMO_HOST ?? "127.0.0.1",
    port: process.env.HAROLD_DEMO_SSH_PORT ?? "2223",
    user: process.env.HAROLD_DEMO_SSH_USER ?? "gary",
    name: process.env.HAROLD_DEMO_NAME ?? "Demo host",
    container: process.env.HAROLD_DEMO_CONTAINER ?? "harold-demo-host",
    typeGapMs,
    workspace: process.env.HAROLD_DEMO_WORKSPACE ?? "cat-screensaver",
    agent: process.env.HAROLD_DEMO_AGENT ?? "OpenCode",
    planMode: process.env.HAROLD_DEMO_PLAN_MODE ?? "plan",
    buildMode: process.env.HAROLD_DEMO_BUILD_MODE ?? "build",
    answerOption: process.env.HAROLD_DEMO_ANSWER ?? "Settings toggle",
    diffFile: process.env.HAROLD_DEMO_DIFF_FILE ?? "settings.js",
    worktrees: envList(process.env.HAROLD_DEMO_WORKTREES, ["main", "feat/cat-mode"]),
  }
}

// --- Self test ---------------------------------------------------------------

/**
 * Convert a stub ledger through anchors built around it, the way the walk does
 * with live samples, and prove every mark lands inside the window in order.
 */
const verifyConversion = (
  name: SliceName,
  marks: readonly ProbeMark[],
): Readonly<{ anchors: readonly AnchorSample[]; fit: ClockFit; marks: readonly TimedMark[]; startedSec: number; endedSec: number }> => {
  if (marks.length === 0) {
    throw new Error(`self-test: slice ${name} produced no device marks`)
  }
  const firstNanos = marks[0].nanos
  const lastNanos = marks[marks.length - 1].nanos
  const spanSec = (lastNanos - firstNanos) / 1e9
  const anchors: readonly AnchorSample[] = [
    { deviceNanos: firstNanos - 1e9, hostSec: 1, rttSec: 0.002 },
    { deviceNanos: firstNanos, hostSec: 2, rttSec: 0.002 },
    { deviceNanos: lastNanos + 1e9, hostSec: 3 + spanSec, rttSec: 0.002 },
  ]
  const fit = fitClock(anchors)
  const startedSec = 0.5
  const endedSec = 4 + spanSec
  const timed = mapMarks(marks, fit, { startedSec, endedSec })
  if (timed.length !== marks.length) {
    throw new Error(`self-test: slice ${name} dropped device marks in conversion`)
  }
  if (Math.abs(timed[0].hostSec - 2) > 1e-6) {
    throw new Error(
      `self-test: the first mark of ${name} maps to host ${timed[0].hostSec}, expected 2`,
    )
  }
  return { anchors, fit, marks: timed, startedSec, endedSec }
}

/**
 * Drive every beat against the in-memory stub, then prove the sequencing, the
 * device mark conversion and the marks.log rows. No device, no adb, no docker.
 */
export const runSelfTest = async (): Promise<number> => {
  const config = configFromEnv()
  const stub = makeProbeStub()
  const rows: MarkRow[] = []
  const verified: SliceName[] = []

  const ctx = makeContext({
    call: stub.callTool,
    hostNow: stub.hostNow,
    log: () => {},
    sleep: async () => {},
    sink: { push: (row) => rows.push(row), taps: true },
    config,
    viewport: stub.viewport,
    swipe: async () => {},
    dismissKeyboard: async () => {},
    authorizeKey: async (publicKey) => {
      if (!publicKey.startsWith("ssh-")) {
        throw new Error(`the stub key is not a public key: ${publicKey}`)
      }
    },
  })

  for (const beat of BEATS) {
    const before = stub.calls().length
    const first = rows.length
    // Same boundary `recordSlice` uses, so a slice only ever sees its own marks.
    await ctx.clearMarks()
    await beat.run(ctx)
    const calls = stub.calls().slice(before)
    if (calls.length === 0) {
      throw new Error(`self-test: beat ${beat.name} made no tool calls`)
    }
    if (beat.kind === "onCamera" && rows.length === first) {
      throw new Error(`self-test: on-camera beat ${beat.name} emitted no marks`)
    }
    if (beat.kind === "onCamera") {
      const marks = stub.ledger()
      assertClosedKeyRuns(marks)
      // Only a beat that types leaves device marks to convert. The rest are
      // valid on-camera slices with host rows only.
      if (marks.length > 0) {
        verifyConversion(beat.name, marks)
        verified.push(beat.name)
      }
    }
  }

  if (!verified.includes("connect_fill")) {
    throw new Error("self-test: the fill beat produced no convertible device marks")
  }
  const typedSlices: readonly SliceName[] = ["plan", "build", "pr"]
  const missingTyped = typedSlices.filter((name) => !verified.includes(name))
  if (missingTyped.length > 0) {
    throw new Error(
      `self-test: ${missingTyped.join(", ")} produced no convertible device marks`,
    )
  }

  if (stub.screenName() !== "chat") {
    throw new Error(
      `self-test: the walk should end on the chat screen, stub is on ${stub.screenName() ?? "(none)"}`,
    )
  }
  const finalFacts = stub.facts()
  if ((finalFacts.sessionId ?? "").length === 0) {
    throw new Error("self-test: the walk ended without a session")
  }
  if ((finalFacts.error ?? "").length > 0) {
    throw new Error(`self-test: the walk ended with a ${finalFacts.error}`)
  }
  if (!(finalFacts.lastAssistantText ?? "").includes("https://github.com")) {
    throw new Error(
      `self-test: the walk ended without a PR URL (${JSON.stringify(finalFacts.lastAssistantText ?? "")})`,
    )
  }

  const rowsText = renderRows(sortRows(rows))
  if (!rowsText.includes("host_fields_filled ")) {
    throw new Error("self-test: the fill beat wrote no host_fields_filled mark")
  }
  if (!/^\w[\w_]* \d+\.\d{3}$/m.test(rowsText)) {
    throw new Error(`self-test: marks.log rows do not match the grammar:\n${rowsText}`)
  }

  const taps = stub.calls().filter((call) => call.name === "harold_tap")
  const tapTags = [...new Set(taps.map((call) => String(call.args.tag)))]
  console.log(
    `self-test: ${slicePlan.length} beats, ${stub.calls().length} tool calls, ` +
      `${verified.length} recorded slices, taps on ${tapTags.join(", ")}`,
  )
  console.log(`self-test: ${sortRows(rows).length} marks.log rows, clock limits ${JSON.stringify(clockLimits)}`)
  return 0
}

// --- Main --------------------------------------------------------------------

const summarize = (report: WalkReport): void => {
  console.log("")
  console.log(
    `walk: ${report.slices.length} slices, ${report.typedCharacters} characters, ` +
      `${(report.durationMs / 1000).toFixed(1)}s`,
  )
  console.log(`walk: final screen ${report.finalScreen.screen ?? "(none)"}`)
}

const main = async (): Promise<number> => {
  const cli = parseArgs(process.argv.slice(2))
  if (cli.help) {
    console.log(usage())
    return 0
  }
  if (cli.list) {
    printPlan()
    return 0
  }
  if (cli.selfTest) {
    return runSelfTest()
  }

  if (cli.serial !== undefined) {
    process.env.ANDROID_SERIAL = cli.serial
  }

  const out = {
    dir: cli.out,
    slicesDir: join(cli.out, "slices"),
    marksPath: join(cli.out, "marks.log"),
    manifestPath: join(cli.out, "slices.json"),
  }
  mkdirSync(out.slicesDir, { recursive: true })
  writeFileSync(out.manifestPath, "[]\n")
  // `build_capture.py` walks the whole file to pair key runs, so a stale row
  // from an earlier run would corrupt the pairing. Every run starts clean.
  writeFileSync(out.marksPath, "")

  const config = configFromEnv()
  const log = (message: string): void =>
    console.log(`[${(performance.now() / 1000).toFixed(1)}] ${message}`)
  const device = makeDeviceControl({ log })
  const probe = await connectProbe()

  try {
    const report = await runWalk({
      call: probe.callTool,
      hostNow: () => performance.now() / 1000,
      log,
      sleep: (ms) => new Promise((done) => setTimeout(done, ms)),
      config,
      device,
      viewport: screenSize,
      swipe: async (request) => swipe(request.x, request.fromY, request.x, request.toY, request.durationMs),
      dismissKeyboard: async () => {
        if (await imeVisible()) {
          await keyevent("KEYCODE_BACK")
        }
      },
      authorizeKey: async (publicKey) => {
        execFileSync("docker", ["exec", "-i", config.container, "add-authorized-key"], {
          input: `${publicKey}\n`,
          encoding: "utf8",
        })
      },
      out,
      only: cli.only,
    })
    await writeFile(join(out.dir, "walk-report.json"), `${JSON.stringify(report, null, 2)}\n`)
    summarize(report)
    return 0
  } finally {
    await device.stopRecording()
    await probe.close()
  }
}

if (import.meta.main) {
  try {
    process.exitCode = await main()
  } catch (error) {
    console.error(`walk: ${failure(error)}`)
    process.exitCode = 1
  }
}
