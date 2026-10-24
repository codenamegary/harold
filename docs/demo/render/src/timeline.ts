import { Easing } from "remotion"
import { pairSegs, statusSegs, type TermItem } from "./terminal-data"

export type CaptureTap = { x: number; y: number; atSec: number }

export type CaptureSlice = {
  name: string
  file: string
  durationSec: number
  width: number
  height: number
  still?: boolean
  taps?: CaptureTap[]
}

export type DemoProps = {
  slices: CaptureSlice[]
  videoWidth: number
  videoHeight: number
}

export const FPS = 30
export const OUTRO_SEC = 4.2

// --- Edit timeline ----------------------------------------------------------
//
// capture.json is raw material: one video per action, with tap positions and
// the time each tap landed inside its slice. This file is the edit. Adjust a
// shot's rate, duration, hold, caption, or typing and the rest of the walk
// shifts with it. Nothing here requires a re-capture.

const PHONE_IN_AT = 8.8
const PAIR_ZOOM_AT = 15.0
const PAIR_ZOOM_SEC = 0.5
const PAIR_LAND_AT = 20.7
const PAIR_LAND_SEC = 0.5
const REcede_AT = 22.8
const WALK_START = 27.8

type TypingWindow = { text: string; fromSec: number; toSec: number }

// [SPOTLIGHT] a full-stage feature beat. The phone docks to one side, the
// terminal leaves, and this copy fills the other side in display type. It is
// the large, editorial sibling of [CAP], for milestones and headline features.
export type Spotlight = {
  at: number
  hold: number
  side: "left" | "right"
  kicker: string
  title: string
}

type SpotlightSpec = {
  at?: number
  hold?: number
  side?: "left" | "right"
  kicker: string
  title: string
}

// [POP] one short squash, shake, and settle on the phone. `at` is seconds
// after the shot starts. Use it when the app reaches a happy state.
// `confetti` drops a full-stage shower from the same beat.
export type Celebration = {
  at: number
  hold: number
  strength: number
  confetti: boolean
}

type CelebrationSpec = {
  at?: number
  hold?: number
  strength?: number
  confetti?: boolean
}

// [ZOOM] push the camera into the phone for a feature beat. `x`/`y` are
// screen fractions of the point to frame; they default to the shot's first
// tap. `drift` pans the focus down by that fraction over the shot, for
// reading a reply. Consecutive shots with a focus hold the zoom; a shot with
// none pulls back out.
export type Focus = { scale: number; x?: number; y?: number; drift?: number }

type Step = {
  slice: string
  at?: number
  startSec?: number
  rate?: number
  duration?: number
  hold?: number
  required?: boolean
  caption?: { text: string; at?: number; hold?: number }
  spotlight?: SpotlightSpec
  celebrate?: CelebrationSpec
  typing?: TypingWindow | TypingWindow[]
  focus?: Focus
}

const COMPOSER: Focus = { scale: 2.4, x: 0.5, y: 0.81 }
const EFFORT: Focus = { scale: 2.6, x: 0.6, y: 0.81 }
const READ: Focus = { scale: 1.6, x: 0.5, y: 0.33, drift: 0.22 }

// The pairing act is interleaved with the terminal stage, so its shots keep
// fixed render starts. Gaps between them become holds on the previous frame.
const PAIR_STEPS: Step[] = [
  { slice: "pair_idle", at: 9.4 },
  { slice: "pair_tap", at: 14.2, startSec: 2.55, duration: 1.6 },
  { slice: "scanner_open", at: 15.8, rate: 8, duration: 0.35 },
  { slice: "scan_wait", at: 16.5, rate: 2, duration: 1.0 },
  {
    slice: "first_name",
    at: 17.5,
    startSec: 2.6,
    rate: 1.4,
    duration: 2.6,
    typing: { text: "Work", fromSec: 4.85, toSec: 5.6 },
  },
  { slice: "first_confirm", at: 20.2, startSec: 3.0, rate: 2, duration: 1.4 },
  {
    slice: "paired",
    at: 21.6,
    spotlight: {
      at: 1.2,
      hold: 3.2,
      kicker: "Achievement unlocked",
      title: "Work from Couch",
    },
    celebrate: { at: 1.7, hold: 1.3, confetti: true },
  },
]

// The walk starts after the paired home. Every shot starts where the previous
// one ends plus its hold, so changing one duration moves the rest.
const WALK_STEPS: Step[] = [
  {
    slice: "pair_another_open",
    startSec: 2.4,
    rate: 2,
    duration: 3.8,
    hold: 0.3,
    caption: { text: "Pair another Harold", at: 0.2, hold: 2.4 },
  },
  { slice: "pair_another_manual", startSec: 2.9, rate: 1.5, duration: 1.7, hold: 0.3 },
  {
    slice: "pair_another_details",
    startSec: 2.8,
    rate: 1.5,
    duration: 4.0,
    hold: 0.3,
    typing: [
      { text: "http://127.0.0.1:3848", fromSec: 3.55, toSec: 5.95 },
      { text: "GTN-5DK", fromSec: 7.2, toSec: 8.6 },
    ],
    focus: { scale: 1.8, x: 0.5, y: 0.22 },
  },
  { slice: "pair_another_claim", startSec: 2.8, rate: 2, duration: 1.4, hold: 0.4 },
  {
    slice: "pair_another_name",
    startSec: 2.7,
    rate: 1.5,
    duration: 2.0,
    hold: 0.4,
    typing: { text: "Couch", fromSec: 4.3, toSec: 5.15 },
    focus: { scale: 1.7, x: 0.5, y: 0.3 },
  },
  { slice: "pair_another_confirm", startSec: 2.9, rate: 2, duration: 1.5, hold: 0.3 },
  { slice: "pair_another_done", duration: 0.8, hold: 0.3 },
  {
    slice: "session_menu_open",
    startSec: 2.4,
    rate: 2,
    duration: 2.2,
    hold: 0.5,
    caption: { text: "Access your agent session history", at: 0.2, hold: 4.0 },
  },
  { slice: "session_see_all", startSec: 2.5, rate: 2.5, duration: 2.2, hold: 0.4 },
  { slice: "session_pick", startSec: 2.5, rate: 2.5, duration: 1.0, hold: 0.3 },
  { slice: "session_chat", rate: 2, duration: 1.0, hold: 0.3 },
  { slice: "session_menu_reopen", startSec: 2.4, rate: 2.5, duration: 1.8, hold: 0.4 },
  {
    slice: "new_session",
    startSec: 2.5,
    rate: 2,
    duration: 1.15,
    hold: 0.3,
    caption: { text: "Start a new session", at: 0.2, hold: 2.4 },
  },
  { slice: "workspace_open_work", startSec: 2.6, rate: 2.5, duration: 1.8, hold: 0.3 },
  { slice: "workspace_pick_work", startSec: 2.5, rate: 2, duration: 0.5, hold: 0.2 },
  { slice: "agent_open_work", startSec: 2.6, rate: 2.5, duration: 1.65, hold: 0.3 },
  { slice: "agent_pick_work", startSec: 2.5, rate: 2, duration: 0.4, hold: 0.2 },
  { slice: "workspace_open_couch", startSec: 2.6, rate: 2, duration: 1.1, hold: 0.3 },
  { slice: "workspace_pick_couch", startSec: 2.6, rate: 1.5, duration: 1.4, hold: 0.3 },
  { slice: "agent_open_couch", startSec: 2.6, rate: 2, duration: 1.05, hold: 0.3 },
  { slice: "agent_pick_couch", startSec: 2.5, rate: 2, duration: 0.4, hold: 0.2 },
  { slice: "continue", startSec: 2.6, rate: 2.5, duration: 2.0, hold: 0.2 },
  { slice: "session_create_wait", rate: 2, duration: 1.0, hold: 0.2 },
  {
    slice: "model_open",
    startSec: 2.6,
    rate: 2,
    duration: 1.2,
    hold: 0.3,
    caption: { text: "Model list from your Agent", at: 0.2, hold: 2.4 },
    focus: { scale: 1.7, x: 0.5, y: 0.72 },
  },
  {
    slice: "model_search",
    startSec: 2.75,
    duration: 2.2,
    typing: { text: "deepseek", fromSec: 3.4, toSec: 4.5 },
    hold: 0.3,
    focus: { scale: 1.7, x: 0.5, y: 0.72 },
  },
  {
    slice: "model_pick",
    startSec: 2.5,
    rate: 2,
    duration: 0.8,
    hold: 0.3,
    focus: { scale: 1.7, x: 0.5, y: 0.72 },
  },
  {
    slice: "mode_plan",
    startSec: 4.5,
    rate: 1.5,
    duration: 1.5,
    hold: 1.0,
    caption: { text: "Toggle modes supported by your agent", at: 0.2, hold: 2.6 },
    focus: COMPOSER,
  },
  { slice: "mode_build", startSec: 4.8, rate: 1.5, duration: 1.4, hold: 1.0, focus: COMPOSER },
  {
    slice: "effort_1",
    startSec: 0.5,
    duration: 0.8,
    hold: 0.25,
    caption: { text: "Adjust thinking effort", at: 0.2, hold: 2.2 },
    focus: EFFORT,
  },
  { slice: "effort_2", startSec: 0.5, duration: 0.8, hold: 0.25, focus: EFFORT },
  { slice: "effort_3", startSec: 0.5, duration: 0.8, hold: 0.3, focus: EFFORT },
  {
    slice: "slash_open",
    startSec: 2.6,
    rate: 2.5,
    duration: 2.0,
    hold: 1.0,
    caption: { text: "Slash commands from your agent", at: 0.2, hold: 2.4 },
    focus: { scale: 1.6, x: 0.5, y: 0.3 },
  },
  {
    slice: "slash_close",
    startSec: 2.6,
    rate: 2,
    duration: 0.8,
    hold: 0.5,
    focus: { scale: 1.6, x: 0.5, y: 0.3 },
  },
  {
    slice: "prompt_focus",
    startSec: 2.5,
    rate: 2,
    duration: 0.5,
    hold: 0.2,
    caption: { text: "Send a text Prompt", at: 0.2, hold: 2.6 },
    focus: { scale: 1.8, x: 0.5, y: 0.52 },
  },
  {
    slice: "prompt_type",
    startSec: 0.4,
    rate: 1.3,
    duration: 4.1,
    typing: {
      text: "Do you think my cat's behaviour is strange?",
      fromSec: 0.55,
      toSec: 5.5,
    },
    hold: 0.7,
    focus: { scale: 1.8, x: 0.5, y: 0.52 },
  },
  {
    slice: "photo_open",
    startSec: 2.6,
    rate: 2,
    duration: 1.1,
    hold: 0.3,
    caption: { text: "Attachments", at: 0.2, hold: 2.6 },
  },
  { slice: "photo_pick", startSec: 2.6, rate: 2, duration: 0.8, hold: 0.3 },
  { slice: "photo_add", startSec: 2.6, rate: 2, duration: 1.1, hold: 0.3 },
  { slice: "file_open", startSec: 2.6, rate: 2, duration: 1.0, hold: 0.3 },
  { slice: "file_pick", startSec: 2.7, rate: 2, duration: 1.0, hold: 0.25 },
  {
    slice: "send",
    startSec: 2.8,
    rate: 2,
    duration: 1.2,
    hold: 0.2,
    focus: { scale: 1.8, x: 0.5, y: 0.84 },
  },
  { slice: "reply_wait", rate: 6, duration: 1.8, hold: 0.2 },
  { slice: "reply", duration: 2.5, hold: 1.6, focus: READ },
  {
    slice: "voice_open",
    startSec: 2.5,
    rate: 2,
    duration: 1.3,
    hold: 0.4,
    focus: { scale: 1.9, x: 0.5, y: 0.9 },
  },
  { slice: "voice_expand", startSec: 3.0, rate: 2, duration: 1.4, hold: 0.6 },
  {
    slice: "voice_transcript",
    startSec: 0.4,
    rate: 2,
    duration: 3.2,
    hold: 0.2,
    focus: { scale: 1.5, x: 0.5, y: 0.22 },
  },
  { slice: "voice_send", startSec: 3.0, rate: 2, duration: 0.9, hold: 0.2 },
  { slice: "voice_reply_wait", rate: 6, duration: 1.7, hold: 0.2 },
  { slice: "voice_reply", duration: 2.5, hold: 1.6, focus: READ },
]

type Shot = Step & {
  at: number
  startSec: number
  rate: number
  duration: number
  data: CaptureSlice
}

export type PhoneClip =
  | {
      kind: "play"
      file: string
      from: number
      duration: number
      rate: number
      startSec: number
    }
  | { kind: "hold"; file: string; from: number; duration: number; atSec: number }

const DEFAULT_SHOT_SEC = 2.0

const shotDuration = (step: Step, data: CaptureSlice): number => {
  const rate = step.rate ?? 1
  const startSec = step.startSec ?? 0
  const remaining = Math.max(0.05, data.durationSec - startSec)
  const available = data.still ? data.durationSec : remaining / rate
  const fallback = data.still ? Math.min(available, 1.5) : Math.min(available, DEFAULT_SHOT_SEC)
  return Math.max(0.05, Math.min(step.duration ?? fallback, available))
}

const buildShots = (slices: CaptureSlice[]): { pair: Shot[]; walk: Shot[] } => {
  const byName = new Map(slices.map((slice) => [slice.name, slice]))
  const resolve = (step: Step): Shot => {
    const data = byName.get(step.slice)
    if (data === undefined) {
      throw new Error(
        `capture.json is missing slice "${step.slice}". Re-run docs/demo/capture/capture.sh.`,
      )
    }
    return {
      ...step,
      at: step.at ?? 0,
      startSec: data.still ? 0 : (step.startSec ?? 0),
      rate: step.rate ?? 1,
      duration: shotDuration(step, data),
      data,
    }
  }

  const pair = PAIR_STEPS.map((step) => resolve(step))
  const walk: Shot[] = []
  let at = WALK_START
  for (const step of WALK_STEPS) {
    if (!byName.has(step.slice)) {
      if (step.required === false) {
        continue
      }
      resolve(step)
    }
    const shot = resolve(step)
    shot.at = at
    walk.push(shot)
    at += shot.duration + (shot.hold ?? 0)
  }
  return { pair, walk }
}

const buildClips = (shots: Shot[]): PhoneClip[] => {
  const clips: PhoneClip[] = []
  const ordered = [...shots].sort((a, b) => a.at - b.at)
  for (let index = 0; index < ordered.length; index += 1) {
    const shot = ordered[index]
    const nextAt = ordered[index + 1]?.at ?? shot.at + shot.duration + (shot.hold ?? 0)
    const playDuration = Math.max(0, Math.min(shot.duration, nextAt - shot.at))
    if (shot.data.still) {
      clips.push({
        kind: "hold",
        file: shot.data.file,
        from: shot.at,
        duration: playDuration,
        atSec: 0,
      })
    } else {
      clips.push({
        kind: "play",
        file: shot.data.file,
        from: shot.at,
        duration: playDuration,
        rate: shot.rate,
        startSec: shot.startSec,
      })
    }
    const holdStart = shot.at + playDuration
    if (nextAt > holdStart + 0.001) {
      clips.push({
        kind: "hold",
        file: shot.data.file,
        from: holdStart,
        duration: nextAt - holdStart,
        atSec: shot.data.still
          ? 0
          : Math.min(shot.data.durationSec, shot.startSec + playDuration * shot.rate),
      })
    }
  }
  return clips
}

export const activeClip = (clips: PhoneClip[], sec: number): PhoneClip | null => {
  let current: PhoneClip | null = null
  for (const clip of clips) {
    if (sec < clip.from) {
      break
    }
    current = clip
  }
  return current
}

export const clipFrame = (clip: PhoneClip, sec: number): number => {
  if (clip.kind === "hold") {
    return clip.atSec
  }
  return Math.max(0, clip.startSec + (sec - clip.from) * clip.rate)
}

// --- Keyframe channels ------------------------------------------------------

export type Keyframes = [number, number][]

const ease = Easing.bezier(0.16, 1, 0.3, 1)

/** Value of a keyframe channel at `sec`, eased between keyframes, clamped. */
export const channel = (keyframes: Keyframes, sec: number): number => {
  if (sec <= keyframes[0][0]) {
    return keyframes[0][1]
  }
  for (let index = 1; index < keyframes.length; index += 1) {
    const [to, valueTo] = keyframes[index]
    if (sec <= to) {
      const [from, valueFrom] = keyframes[index - 1]
      const progress = (sec - from) / (to - from)
      return valueFrom + (valueTo - valueFrom) * ease(progress)
    }
  }
  return keyframes[keyframes.length - 1][1]
}

// Terminal stage: one fixed, vertically centered box for the whole first act.
// The close-up is a pure scale on that box; after pairing the box slides out
// to the left. The origin sits near the top-left so the close-up keeps the
// title bar and the prompt labels in frame.
export const TERM_BOX = { left: 60, top: 60, width: 920, height: 960 }
export const TERM_ORIGIN = "0% 2%"

export const termScale: Keyframes = [
  [0, 1],
  [3.3, 1],
  [4.0, 2.35],
  [8.8, 2.35],
  [9.8, 1],
]
export const termOpacity: Keyframes = [
  [0, 1],
  [REcede_AT, 1],
  [REcede_AT + 1.2, 0],
]
export const termX: Keyframes = [
  [0, 0],
  [REcede_AT, 0],
  [REcede_AT + 1.2, -1120],
]

// Phone stage channels: joins at the pairing flow, to the right of the fully
// framed terminal. The Pair tap starts a 2x close-up of the top two thirds.
// That framing holds through the scanner and name entry. Right after the
// confirm tap it pans up to the centered close-up, so the landing screen is
// readable before the spotlight copy lands. The phone only takes center stage
// when the walkthrough starts.
export const phoneWidth: Keyframes = [
  [PHONE_IN_AT, 380],
  [PAIR_ZOOM_AT, 380],
  [PAIR_ZOOM_AT + PAIR_ZOOM_SEC, 760],
  [REcede_AT, 760],
  [27.0, 760],
  [27.8, 450],
]
export const phoneCenterX: Keyframes = [
  [PHONE_IN_AT, 2440],
  [PHONE_IN_AT + 1.7, 1460],
  [REcede_AT, 1460],
  [27.0, 1460],
  [27.8, 960],
]
export const phoneTop: Keyframes = [
  [PHONE_IN_AT, 108],
  [PAIR_ZOOM_AT, 108],
  [PAIR_ZOOM_AT + PAIR_ZOOM_SEC, 0],
  [PAIR_LAND_AT, 0],
  [PAIR_LAND_AT + PAIR_LAND_SEC, -314.5],
  [27.0, -314.5],
  [27.8, 30],
]
// The screen starts black and fades the app in as the phone settles.
export const phoneBlack: Keyframes = [
  [PHONE_IN_AT, 1],
  [PHONE_IN_AT + 1.0, 0],
]

// --- Phone zoom -------------------------------------------------------------

export type Zoom = { scale: Keyframes; x: Keyframes; y: Keyframes }

const ZOOM_SEC = 0.55

// Three channels driven by the shots' focus: scale, and the screen-fraction
// point that stays framed. Zooming out keeps the last focus so the pull-back
// is a straight line, not a swerve.
const buildZoom = (shots: Shot[]): Zoom => {
  const scale: Keyframes = [[0, 1]]
  const x: Keyframes = [[0, 0.5]]
  const y: Keyframes = [[0, 0.5]]
  const push = (channel: Keyframes, at: number, value: number) => {
    const last = channel[channel.length - 1]
    if (at <= last[0] + 0.001) {
      last[1] = value
      return
    }
    channel.push([at, value])
  }
  const ordered = [...shots].sort((a, b) => a.at - b.at)
  let current: Focus = { scale: 1, x: 0.5, y: 0.5 }
  for (let index = 0; index < ordered.length; index += 1) {
    const shot = ordered[index]
    const end = shot.at + shot.duration + (shot.hold ?? 0)
    const nextAt = ordered[index + 1]?.at ?? end
    const tap = shot.data.taps?.[0]
    const target: Focus =
      shot.focus === undefined
        ? { scale: 1, x: current.x, y: current.y }
        : {
            scale: shot.focus.scale,
            x: shot.focus.x ?? (tap ? tap.x / shot.data.width : current.x),
            y: shot.focus.y ?? (tap ? tap.y / shot.data.height : current.y),
          }
    const same =
      target.scale === current.scale && target.x === current.x && target.y === current.y
    if (!same) {
      const landAt = Math.min(shot.at + ZOOM_SEC, nextAt)
      push(scale, shot.at, current.scale)
      push(x, shot.at, current.x ?? 0.5)
      push(y, shot.at, current.y ?? 0.5)
      push(scale, landAt, target.scale)
      push(x, landAt, target.x ?? 0.5)
      push(y, landAt, target.y ?? 0.5)
    }
    current = target
    if (shot.focus?.drift !== undefined) {
      const to = (target.y ?? 0.5) + shot.focus.drift
      push(y, nextAt, to)
      current = { ...target, y: to }
    }
  }
  return { scale, x, y }
}

// --- Terminal transcript ----------------------------------------------------

const transcript = (pairedRenderSec: number): TermItem[] => {
  const items: TermItem[] = [
    // The prompt sits ready from the first frame; typing starts at typeAt.
    { kind: "command", at: 0, typeAt: 4.6, text: "harold start", cps: 12 },
  ]
  statusSegs.forEach((segs, index) => {
    items.push({ kind: "output", at: 5.95 + index * 0.2, segs })
  })
  items.push({ kind: "command", at: 9.3, text: "harold pair", cps: 10 })
  pairSegs.forEach((segs, index) => {
    items.push({ kind: "output", at: 10.75 + index * 0.2, segs })
  })
  items.push({ kind: "qr", at: 12.0, rowDelay: 0.025 })
  items.push({ kind: "output", at: 13.25, segs: [{ text: "" }] })
  items.push({
    kind: "output",
    at: 13.45,
    segs: [{ text: "Waiting for a device to scan..." }],
  })
  items.push({
    kind: "output",
    at: pairedRenderSec + 0.15,
    segs: [{ text: "Device paired.", color: "lime" }],
  })
  items.push({ kind: "output", at: pairedRenderSec + 0.5, segs: [{ text: "" }] })
  items.push({ kind: "command", at: pairedRenderSec + 0.95, text: "", cps: 1 })
  return items
}

// --- Captions, taps, typing -------------------------------------------------

type CaptionSpec = { at: number; hold: number; text: string }
export type Caption = CaptionSpec

const FIXED_CAPTIONS: CaptionSpec[] = [
  { at: 3.9, hold: 2.6, text: "Start Harold wherever you run your agents" },
  { at: 8.3, hold: 1.6, text: "Generate a secure temporary pairing code" },
  { at: 10.9, hold: 1.4, text: "Harold'ing..." },
  { at: 13.3, hold: 1.4, text: "Pair with your agents" },
]

export type Ripple = { at: number; x: number; y: number }

export const rippleDuration = 0.55
export const rippleColor = "#B6F36B"

const buildRipples = (shots: Shot[]): Ripple[] => {
  const ripples: Ripple[] = []
  for (const shot of shots) {
    if (shot.data.still && shot.data.taps === undefined) {
      continue
    }
    for (const tap of shot.data.taps ?? []) {
      if (tap.atSec < shot.startSec) {
        continue
      }
      const sinceStart = (tap.atSec - shot.startSec) / shot.rate
      const atSec = Math.min(shot.duration, sinceStart)
      ripples.push({
        at: shot.at + atSec,
        x: tap.x / shot.data.width,
        y: tap.y / shot.data.height,
      })
    }
  }
  return ripples.sort((a, b) => a.at - b.at)
}

const buildCaptions = (shots: Shot[]): CaptionSpec[] => {
  const captions = [...FIXED_CAPTIONS]
  for (const shot of shots) {
    if (shot.caption === undefined) {
      continue
    }
    captions.push({
      at: shot.at + (shot.caption.at ?? 0.2),
      hold: shot.caption.hold ?? 2.4,
      text: shot.caption.text,
    })
  }
  return captions.sort((a, b) => a.at - b.at)
}

const buildSpotlights = (shots: Shot[]): Spotlight[] => {
  const spotlights: Spotlight[] = []
  for (const shot of shots) {
    if (shot.spotlight === undefined) {
      continue
    }
    spotlights.push({
      at: shot.at + (shot.spotlight.at ?? 0.2),
      hold: shot.spotlight.hold ?? 3.0,
      side: shot.spotlight.side ?? "left",
      kicker: shot.spotlight.kicker,
      title: shot.spotlight.title,
    })
  }
  return spotlights.sort((a, b) => a.at - b.at)
}

const buildCelebrations = (shots: Shot[]): Celebration[] => {
  const celebrations: Celebration[] = []
  for (const shot of shots) {
    if (shot.celebrate === undefined) {
      continue
    }
    celebrations.push({
      at: shot.at + (shot.celebrate.at ?? shot.duration),
      hold: shot.celebrate.hold ?? 1.3,
      strength: shot.celebrate.strength ?? 1,
      confetti: shot.celebrate.confetti ?? false,
    })
  }
  return celebrations.sort((a, b) => a.at - b.at)
}

// --- Sounds -----------------------------------------------------------------

export type SoundName = "key" | "enter" | "tap" | "ping"

export type Sound = { at: number; name: SoundName; volume: number }

const buildSounds = (
  shots: Shot[],
  captions: CaptionSpec[],
  ripples: Ripple[],
  spotlights: Spotlight[],
): Sound[] => {
  const sounds: Sound[] = []
  // [KR] every keystroke, a separate sound for Enter.
  for (let index = 0; index < 12; index += 1) {
    sounds.push({ at: 4.6 + index / 12, name: "key", volume: 1 })
  }
  sounds.push({ at: 5.62, name: "enter", volume: 1 })
  for (let index = 0; index < 11; index += 1) {
    sounds.push({ at: 9.3 + index / 10, name: "key", volume: 1 })
  }
  sounds.push({ at: 10.44, name: "enter", volume: 1 })
  // [KR] on the phone, spread across the typing slice.
  for (const shot of shots) {
    const windows =
      shot.typing === undefined ? [] : Array.isArray(shot.typing) ? shot.typing : [shot.typing]
    for (const typing of windows) {
      const fromSec = Math.max(shot.startSec, typing.fromSec)
      const toSec = Math.min(shot.startSec + shot.duration * shot.rate, typing.toSec)
      const at = shot.at + (fromSec - shot.startSec) / shot.rate
      const duration = Math.max(0, toSec - fromSec) / shot.rate
      const step = duration / Math.max(1, typing.text.length - 1)
      for (let index = 0; index < typing.text.length; index += 1) {
        sounds.push({ at: at + index * step, name: "key", volume: 0.8 })
      }
    }
  }
  // [TAP] one pop per tap, at the tap.
  for (const ripple of ripples) {
    sounds.push({ at: ripple.at, name: "tap", volume: 0.9 })
  }
  // [CAP] a soft ping when a caption appears.
  for (const caption of captions) {
    sounds.push({ at: caption.at, name: "ping", volume: 0.55 })
  }
  // [SPOTLIGHT] the same ping, a little louder, when the big copy lands.
  for (const spotlight of spotlights) {
    sounds.push({ at: spotlight.at, name: "ping", volume: 0.7 })
  }
  return sounds.sort((a, b) => a.at - b.at)
}

// --- Timeline ---------------------------------------------------------------

export type Timeline = {
  terminal: TermItem[]
  clips: PhoneClip[]
  ripples: Ripple[]
  captions: Caption[]
  spotlights: Spotlight[]
  celebrations: Celebration[]
  sounds: Sound[]
  zoom: Zoom
  endSec: number
}

const tapRenderSec = (shot: Shot | undefined): number | null => {
  const tap = shot?.data.taps?.[0]
  if (shot === undefined || tap === undefined) {
    return null
  }
  return shot.at + Math.max(0, (tap.atSec - shot.startSec) / shot.rate)
}

/**
 * The whole cut, derived from the captured slices.
 */
export const buildTimeline = (slices: CaptureSlice[]): Timeline => {
  const { pair, walk } = buildShots(slices)
  const shots = [...pair, ...walk].sort((a, b) => a.at - b.at)
  const clips = buildClips(shots)
  const ripples = buildRipples(shots)
  const captions = buildCaptions(shots)
  const spotlights = buildSpotlights(shots)
  const celebrations = buildCelebrations(shots)
  const sounds = buildSounds(shots, captions, ripples, spotlights)
  const pairedRenderSec =
    tapRenderSec(pair.find((shot) => shot.slice === "first_confirm")) ??
    pair.find((shot) => shot.slice === "paired")?.at ??
    20.4
  const last = walk[walk.length - 1]
  const endSec = last.at + last.duration + (last.hold ?? 0)
  return {
    terminal: transcript(pairedRenderSec),
    clips,
    ripples,
    captions,
    spotlights,
    celebrations,
    sounds,
    zoom: buildZoom(shots),
    endSec,
  }
}

export const totalSec = (slices: CaptureSlice[]): number => buildTimeline(slices).endSec + OUTRO_SEC
