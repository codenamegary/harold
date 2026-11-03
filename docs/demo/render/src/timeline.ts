import { Easing } from "remotion"
import { pairSegs, statusSegs, waitingSegs, type TermItem } from "./terminal-data"

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
const STORY_ZOOM_SEC = 0.56
const STORY_OUT_SEC = 0.8

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

// [CALLOUT] a feature tag attached to the phone. The first tap of the shot is
// the anchor, so the tag points at the control the user is about to press.
export type Callout = {
  at: number
  hold: number
  eyebrow?: string
  title: string
  hint?: string
  side: "left" | "right"
  targetX: number
  targetY: number
  compact: boolean
  placement: "target" | "edge"
  connector: "string" | "t"
  span?: { y: number; h: number }
}

type CalloutSpec = {
  at?: number
  hold?: number
  eyebrow?: string
  title: string
  hint?: string
  side?: "left" | "right"
  targetX?: number
  targetY?: number
  compact?: boolean
  placement?: "target" | "edge"
  connector?: "string" | "t"
  span?: { y: number; h: number }
}

// [CARDS] a fan of paper cards that spreads out from behind the phone. Use it
// for list or history beats where the story is a collection, not one control.
export type CardFan = {
  at: number
  hold: number
  eyebrow: string
  title: string
  hint?: string
}

type CardFanSpec = {
  at?: number
  hold?: number
  eyebrow: string
  title: string
  hint?: string
}

// [NOTE] one paper note with a lime tape and rule. It slides out from behind
// the phone carrying a single line. No extra copy, no typing.
export type Note = {
  at: number
  hold: number
  label: string
  title: string
}

type NoteSpec = {
  at?: number
  hold?: number
  label: string
  title: string
}

// [BOX] one continuous annotation across a run of controls. A white card sits
// in the empty phone area, a lime box frames the first control, then the box
// slides to the next control and the card text swaps.
export type AnnotationRect = { x: number; y: number; w: number; h: number }

export type Annotation = {
  at: number
  moveAt?: number
  endAt: number
  title: string
  nextTitle?: string
  target: AnnotationRect
  nextTarget?: AnnotationRect
}

type AnnotationSpec = {
  at?: number
  hold?: number
  title: string
  nextTitle?: string
  nextSlice?: string
  endSlice?: string
  target?: AnnotationRect
  nextTarget?: AnnotationRect
}

// [CARD] one white caption card inside the phone screen. Use it when the
// caption belongs in an empty part of the app rather than beside the phone.
export type PhoneCaption = {
  at: number
  hold: number
  title: string
  top: number
  height: number
}

type PhoneCaptionSpec = {
  at?: number
  hold?: number
  title: string
  top?: number
  height?: number
}

// [CARD] one white caption card placed on the stage. `x` and `y` are the
// normalized center of the card. Use it when the phone is off screen or the
// copy belongs beside the phone rather than inside it.
export type StageCard = {
  at: number
  hold: number
  title: string
  x: number
  y: number
  width: number
  height: number
  fontSize: number
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
  callout?: CalloutSpec
  cards?: CardFanSpec
  note?: NoteSpec
  annotation?: AnnotationSpec
  phoneCaption?: PhoneCaptionSpec
  spotlight?: SpotlightSpec
  celebrate?: CelebrationSpec
  typing?: TypingWindow | TypingWindow[]
  focus?: Focus
}

const COMPOSER: Focus = { scale: 2.4, x: 0.5, y: 0.81 }
const PROMPT_TYPE_FOCUS: Focus = { scale: 1.32, x: 0.5, y: 0.34 }
const REPLY_READ: Focus = { scale: 1.6, x: 0.5, y: 0.45, drift: 0.22 }
const HEADER: Focus = { scale: 1.45, x: 0.5, y: 0.1 }
const DIFF: Focus = { scale: 1.35, x: 0.5, y: 0.45 }

export const PLAN_PROMPT =
  "Read the attached spec and the photo of Mia. Plan only; do not edit files. Plan a small cat mode for this screensaver. Do not build yet. Use your question tool exactly once, for one question only: should cat mode be a settings toggle or automatic? The options must be exactly Settings toggle and Automatic. Do not ask about anything else."
export const BUILD_PROMPT =
  "Settings toggle. Implement only the plan now. Put the toggle in src/settings.js, put the cat behavior in src/cat-mode.js, add tests, and commit every change on feat/cat-mode so the worktree is clean. Do not add unrelated features and do not open a PR."
export const PR_PROMPT =
  "Push feat/cat-mode and open a draft PR against main with gh. End with the PR URL."

export const MODE_TARGET: AnnotationRect = { x: 0.67, y: 0.776, w: 0.19, h: 0.06 }
export const THINKING_TARGET: AnnotationRect = { x: 0.83, y: 0.776, w: 0.14, h: 0.06 }

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

// The story starts after the paired home. Every shot starts where the previous
// one ends plus its hold, so changing one duration moves the rest. The walk is
// one real job: new session, plan, attachments, question, build, usage,
// changes, worktrees, and a draft PR.
const STORY_STEPS: Step[] = [
  {
    slice: "session_menu_open",
    startSec: 2.4,
    rate: 2,
    duration: 2.2,
    hold: 0.8,
  },
  {
    slice: "new_session",
    startSec: 2.5,
    rate: 2,
    duration: 1.2,
    hold: 0.4,
    note: {
      at: 0.35,
      hold: 4.8,
      label: "NEW SESSION",
      title: "Start something new",
    },
  },
  { slice: "workspace_open", startSec: 2.6, rate: 2.5, duration: 1.8, hold: 0.3 },
  { slice: "workspace_pick", startSec: 2.5, rate: 2, duration: 1.1, hold: 0.3 },
  { slice: "continue", startSec: 2.6, rate: 2.5, duration: 1.9, hold: 0.2 },
  { slice: "session_create_wait", rate: 2, duration: 1.0, hold: 0.3 },
  {
    slice: "mode_plan",
    startSec: 4.5,
    rate: 1.5,
    duration: 1.6,
    hold: 1.2,
    annotation: {
      at: 0.2,
      title: "Toggle modes supported by your agent",
      target: MODE_TARGET,
    },
    focus: COMPOSER,
  },
  {
    slice: "prompt_focus",
    startSec: 2.5,
    rate: 2,
    duration: 0.6,
    hold: 0.2,
    phoneCaption: {
      at: 0.2,
      hold: 2.6,
      title: "Send a text Prompt",
      top: 0.12,
      height: 150,
    },
    focus: PROMPT_TYPE_FOCUS,
  },
  {
    slice: "prompt_type",
    startSec: 0.2,
    rate: 3,
    duration: 4.2,
    typing: { text: PLAN_PROMPT, fromSec: 0.4, toSec: 12.6 },
    hold: 0.8,
    focus: PROMPT_TYPE_FOCUS,
  },
  {
    slice: "photo_open",
    startSec: 2.6,
    rate: 2,
    duration: 1.3,
    hold: 0.3,
  },
  { slice: "photo_pick", startSec: 2.5, rate: 1.5, duration: 0.6, hold: 0.3 },
  { slice: "photo_add", startSec: 2.6, rate: 2, duration: 1.2, hold: 0.3 },
  { slice: "file_open", startSec: 2.6, rate: 2, duration: 1.1, hold: 0.3 },
  {
    slice: "file_pick",
    startSec: 2.7,
    rate: 2,
    duration: 1.8,
    hold: 0.6,
    callout: {
      at: 0.3,
      hold: 2.0,
      eyebrow: "ATTACHMENTS",
      title: "Give it the spec",
      hint: "A markdown file and a photo of Mia.",
      side: "right",
      compact: true,
      placement: "edge",
      connector: "t",
      targetX: 0.22,
      targetY: 0.56,
      span: { y: 0.42, h: 0.22 },
    },
    focus: PROMPT_TYPE_FOCUS,
  },
  {
    slice: "send",
    startSec: 2.8,
    rate: 2,
    duration: 1.3,
    hold: 0.2,
    focus: { scale: 1.32, x: 0.5, y: 0.42 },
  },
  { slice: "plan_wait", rate: 4, duration: 1.7, hold: 0.3 },
  {
    slice: "plan_reply",
    duration: 2.6,
    hold: 1.8,
    focus: { scale: 1.35, x: 0.5, y: 0.58 },
    callout: {
      at: 0.2,
      hold: 3.6,
      eyebrow: "AGENT QUESTION",
      title: "Get grilled",
      hint: "Interactive question tooling.",
      side: "right",
      compact: true,
      placement: "edge",
      connector: "t",
      targetX: 0.5,
      targetY: 0.72,
      span: { y: 0.64, h: 0.14 },
    },
  },
  { slice: "elicitation_open", startSec: 3.1, rate: 2, duration: 1.2, hold: 0.3 },
  { slice: "elicitation_pick", startSec: 2.6, rate: 1.5, duration: 0.9, hold: 0.4 },
  { slice: "elicitation_submit", startSec: 5.0, rate: 12, duration: 1.9, hold: 1.0 },
  {
    slice: "mode_build",
    startSec: 4.5,
    rate: 1.5,
    duration: 1.5,
    hold: 1.2,
    annotation: {
      at: 0.2,
      title: "Execute the plan",
      target: MODE_TARGET,
    },
    focus: COMPOSER,
  },
  {
    slice: "build_prompt",
    startSec: 2.5,
    rate: 3.8,
    duration: 3.6,
    typing: { text: BUILD_PROMPT, fromSec: 3.1, toSec: 16.0 },
    hold: 0.6,
    focus: PROMPT_TYPE_FOCUS,
  },
  {
    slice: "build_send",
    startSec: 2.5,
    rate: 2,
    duration: 1.2,
    hold: 0.2,
    focus: { scale: 1.32, x: 0.5, y: 0.42 },
  },
  { slice: "build_wait", rate: 16, duration: 3.2, hold: 0.3 },
  {
    slice: "build_reply",
    duration: 3.2,
    hold: 2.2,
    focus: REPLY_READ,
  },
  {
    slice: "usage",
    duration: 2.6,
    hold: 1.4,
    focus: HEADER,
    callout: {
      at: 0.2,
      hold: 2.8,
      eyebrow: "USAGE",
      title: "Know what it cost",
      hint: "Tokens and dollars, in the header.",
      side: "right",
      compact: true,
      placement: "edge",
      connector: "t",
      targetX: 0.45,
      targetY: 0.1,
      span: { y: 0.05, h: 0.1 },
    },
  },
  {
    slice: "changes_open",
    startSec: 2.5,
    rate: 2,
    duration: 1.1,
    hold: 0.5,
    callout: {
      at: 0.15,
      hold: 2.4,
      eyebrow: "CHANGES",
      title: "Review the code",
      side: "right",
      compact: true,
      placement: "edge",
      connector: "t",
      targetX: 0.82,
      targetY: 0.18,
      span: { y: 0.08, h: 0.22 },
    },
  },
  { slice: "changes_branch", startSec: 2.5, rate: 2, duration: 1.1, hold: 0.5 },
  {
    slice: "changes_file",
    startSec: 2.5,
    rate: 2,
    duration: 1.8,
    hold: 1.0,
    focus: DIFF,
    callout: {
      at: 0.4,
      hold: 2.2,
      eyebrow: "CHANGES",
      title: "Pretty diffs!",
      side: "right",
      compact: true,
      placement: "edge",
      connector: "t",
      targetX: 0.5,
      targetY: 0.46,
      span: { y: 0.25, h: 0.38 },
    },
  },
  { slice: "changes_back", startSec: 2.5, rate: 2, duration: 1.1, hold: 0.4 },
  {
    slice: "worktrees_open",
    startSec: 2.5,
    rate: 2,
    duration: 1.6,
    hold: 0.8,
    callout: {
      at: 0.3,
      hold: 1.9,
      eyebrow: "WORKTREES",
      title: "Auto-detect, or choose",
      hint: "Pick the worktree to inspect.",
      side: "right",
      compact: true,
      placement: "edge",
      connector: "t",
      targetX: 0.5,
      targetY: 0.82,
      span: { y: 0.68, h: 0.24 },
    },
  },
  { slice: "worktrees_close", startSec: 0.1, rate: 1.5, duration: 0.8, hold: 0.3 },
  {
    slice: "pr_prompt",
    startSec: 2.5,
    rate: 2,
    duration: 1.0,
    hold: 0.2,
    focus: PROMPT_TYPE_FOCUS,
  },
  {
    slice: "pr_send",
    startSec: 0.2,
    rate: 3.5,
    duration: 3.6,
    typing: { text: PR_PROMPT, fromSec: 0.4, toSec: 12.0 },
    hold: 0.4,
    focus: PROMPT_TYPE_FOCUS,
    callout: {
      at: 0.2,
      hold: 3.4,
      eyebrow: "DRAFT PR",
      title: "Just like always",
      hint: "The agent pushes and opens it.",
      side: "right",
      compact: true,
      placement: "edge",
      connector: "t",
      targetX: 0.87,
      targetY: 0.52,
      span: { y: 0.36, h: 0.26 },
    },
  },
  { slice: "pr_wait", rate: 6, duration: 2.5, hold: 0.3 },
  {
    slice: "pr_reply",
    duration: 3.2,
    hold: 4.0,
    spotlight: {
      at: 1.0,
      hold: 3.2,
      side: "left",
      kicker: "The whole loop",
      title: "From plan to PR",
    },
  },
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

const buildShots = (slices: CaptureSlice[]): { pair: Shot[]; story: Shot[] } => {
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
  const story: Shot[] = []
  let at = WALK_START
  for (const step of STORY_STEPS) {
    if (!byName.has(step.slice)) {
      if (step.required === false) {
        continue
      }
      resolve(step)
    }
    const shot = resolve(step)
    shot.at = at
    story.push(shot)
    at += shot.duration + (shot.hold ?? 0)
  }
  return { pair, story }
}

const buildPhoneStage = (story: Shot[]): PhoneStage => {
  const newSession = story.find((shot) => shot.slice === "new_session")
  const continueShot = story.find((shot) => shot.slice === "continue")
  const prReply = story.find((shot) => shot.slice === "pr_reply")
  if (newSession === undefined || continueShot === undefined) {
    throw new Error("the story needs new_session and continue shots to place the phone")
  }
  // Enlarge when the new session form opens, hold through workspace selection,
  // and pull back when Continue is tapped.
  const zoomAt = newSession.at
  const outAt = Math.max(zoomAt + STORY_ZOOM_SEC, tapRenderSec(continueShot) ?? continueShot.at)
  // The final spotlight needs the phone out of the copy's side.
  // Dock when the PR spotlight starts, not when the reply clip lands, so the
  // hold before the spotlight stays readable in place.
  const spotlightLead = prReply?.spotlight?.at ?? 1.0
  const dockAt = prReply !== undefined ? prReply.at + spotlightLead - 0.2 : outAt + STORY_OUT_SEC
  return {
    width: [
      ...PAIR_PHONE_WIDTH,
      [zoomAt, 450],
      [zoomAt + STORY_ZOOM_SEC, 760],
      [outAt, 760],
      [outAt + STORY_OUT_SEC, 450],
      [dockAt, 450],
      [dockAt + STORY_ZOOM_SEC, 760],
    ],
    centerX: [
      ...PAIR_PHONE_CENTER_X,
      [zoomAt, 960],
      [zoomAt + STORY_ZOOM_SEC, 1460],
      [outAt, 1460],
      [outAt + STORY_OUT_SEC, 960],
      [dockAt, 960],
      [dockAt + STORY_ZOOM_SEC, 1460],
    ],
    top: [
      ...PAIR_PHONE_TOP,
      [zoomAt, 30],
      [zoomAt + STORY_ZOOM_SEC, 0],
      [outAt, 0],
      [outAt + STORY_OUT_SEC, 30],
      [dockAt, 30],
      [dockAt + STORY_ZOOM_SEC, -314.5],
    ],
  }
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
// readable before the spotlight copy lands. The phone takes center stage when
// the story starts.
const PAIR_PHONE_WIDTH: Keyframes = [
  [PHONE_IN_AT, 380],
  [PAIR_ZOOM_AT, 380],
  [PAIR_ZOOM_AT + PAIR_ZOOM_SEC, 760],
  [REcede_AT, 760],
  [27.0, 760],
  [27.8, 450],
]
const PAIR_PHONE_CENTER_X: Keyframes = [
  [PHONE_IN_AT, 2440],
  [PHONE_IN_AT + 1.7, 1460],
  [REcede_AT, 1460],
  [27.0, 1460],
  [27.8, 960],
]
const PAIR_PHONE_TOP: Keyframes = [
  [PHONE_IN_AT, 108],
  [PAIR_ZOOM_AT, 108],
  [PAIR_ZOOM_AT + PAIR_ZOOM_SEC, 0],
  [PAIR_LAND_AT, 0],
  [PAIR_LAND_AT + PAIR_LAND_SEC, -314.5],
  [27.0, -314.5],
  [27.8, 30],
]

export type PhoneStage = {
  width: Keyframes
  centerX: Keyframes
  top: Keyframes
}

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
    const same = target.scale === current.scale && target.x === current.x && target.y === current.y
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
    segs: waitingSegs,
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

const FIXED_STAGE_CARDS: StageCard[] = [
  {
    at: 3.9,
    hold: 2.6,
    title: "Start Harold wherever you run your agents",
    x: 0.5,
    y: 0.84,
    width: 600,
    height: 190,
    fontSize: 32,
  },
  {
    at: 8.3,
    hold: 1.6,
    title: "Generate a secure temporary pairing code",
    x: 0.5,
    y: 0.87,
    width: 520,
    height: 150,
    fontSize: 32,
  },
  {
    at: 10.9,
    hold: 1.4,
    title: "Harold'ing...",
    x: 0.51,
    y: 0.64,
    width: 520,
    height: 160,
    fontSize: 32,
  },
  {
    at: 13.3,
    hold: 1.4,
    title: "Pair with your agents",
    x: 0.51,
    y: 0.74,
    width: 520,
    height: 160,
    fontSize: 32,
  },
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
  const captions: CaptionSpec[] = []
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

const buildStageCards = (): StageCard[] => [...FIXED_STAGE_CARDS].sort((a, b) => a.at - b.at)

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

const buildCallouts = (shots: Shot[]): Callout[] => {
  const callouts: Callout[] = []
  for (const shot of shots) {
    if (shot.callout === undefined) {
      continue
    }
    const tap = shot.data.taps?.[0]
    callouts.push({
      at: shot.at + (shot.callout.at ?? 0.2),
      hold: shot.callout.hold ?? 2.4,
      eyebrow: shot.callout.eyebrow,
      title: shot.callout.title,
      hint: shot.callout.hint,
      side: shot.callout.side ?? "right",
      targetX: shot.callout.targetX ?? (tap ? tap.x / shot.data.width : 0.5),
      targetY: shot.callout.targetY ?? (tap ? tap.y / shot.data.height : 0.5),
      compact: shot.callout.compact ?? false,
      placement: shot.callout.placement ?? "target",
      connector: shot.callout.connector ?? "string",
      span: shot.callout.span,
    })
  }
  return callouts.sort((a, b) => a.at - b.at)
}

const buildCardFans = (shots: Shot[]): CardFan[] => {
  const fans: CardFan[] = []
  for (const shot of shots) {
    if (shot.cards === undefined) {
      continue
    }
    fans.push({
      at: shot.at + (shot.cards.at ?? 0.2),
      hold: shot.cards.hold ?? 3,
      eyebrow: shot.cards.eyebrow,
      title: shot.cards.title,
      hint: shot.cards.hint,
    })
  }
  return fans.sort((a, b) => a.at - b.at)
}

const buildNotes = (shots: Shot[]): Note[] => {
  const notes: Note[] = []
  for (const shot of shots) {
    if (shot.note === undefined) {
      continue
    }
    notes.push({
      at: shot.at + (shot.note.at ?? 0.2),
      hold: shot.note.hold ?? 2.6,
      label: shot.note.label,
      title: shot.note.title,
    })
  }
  return notes.sort((a, b) => a.at - b.at)
}

const buildAnnotations = (shots: Shot[]): Annotation[] => {
  const bySlice = new Map(shots.map((shot) => [shot.slice, shot]))
  const annotations: Annotation[] = []
  for (const shot of shots) {
    if (shot.annotation === undefined) {
      continue
    }
    const hasNext = shot.annotation.nextSlice !== undefined
    const next = hasNext ? bySlice.get(shot.annotation.nextSlice!) : undefined
    const end = shot.annotation.endSlice ? bySlice.get(shot.annotation.endSlice) : shot
    if (hasNext && next === undefined) {
      throw new Error(
        `annotation on "${shot.slice}" is missing "${shot.annotation.nextSlice}"`,
      )
    }
    const endAt =
      shot.annotation.hold !== undefined
        ? shot.at + (shot.annotation.at ?? 0.2) + shot.annotation.hold
        : (end?.at ?? shot.at) + (end?.duration ?? shot.duration) + (end?.hold ?? 0) - 0.2
    annotations.push({
      at: shot.at + (shot.annotation.at ?? 0.2),
      moveAt: next ? next.at + 0.2 : undefined,
      endAt,
      title: shot.annotation.title,
      nextTitle: shot.annotation.nextTitle,
      target: shot.annotation.target ?? MODE_TARGET,
      nextTarget: shot.annotation.nextTarget,
    })
  }
  return annotations.sort((a, b) => a.at - b.at)
}

const buildPhoneCaptions = (shots: Shot[]): PhoneCaption[] => {
  const captions: PhoneCaption[] = []
  for (const shot of shots) {
    if (shot.phoneCaption === undefined) {
      continue
    }
    captions.push({
      at: shot.at + (shot.phoneCaption.at ?? 0.2),
      hold: shot.phoneCaption.hold ?? 2.0,
      title: shot.phoneCaption.title,
      top: shot.phoneCaption.top ?? 0.5,
      height: shot.phoneCaption.height ?? 190,
    })
  }
  return captions.sort((a, b) => a.at - b.at)
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
  callouts: Callout[],
  cardFans: CardFan[],
  notes: Note[],
  annotations: Annotation[],
  phoneCaptions: PhoneCaption[],
  stageCards: StageCard[],
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
  // [CALLOUT] a soft ping when the tag lands.
  for (const callout of callouts) {
    sounds.push({ at: callout.at, name: "ping", volume: 0.65 })
  }
  // [CARDS] the same ping when the fan spreads.
  for (const fan of cardFans) {
    sounds.push({ at: fan.at, name: "ping", volume: 0.65 })
  }
  // [NOTE] and again when the paper note lands.
  for (const note of notes) {
    sounds.push({ at: note.at, name: "ping", volume: 0.65 })
  }
  // [BOX] a pair of soft pings as the box lands and moves.
  for (const annotation of annotations) {
    sounds.push({ at: annotation.at, name: "ping", volume: 0.65 })
    if (annotation.moveAt !== undefined) {
      sounds.push({ at: annotation.moveAt, name: "ping", volume: 0.65 })
    }
  }
  // [CARD] a soft ping when the in-phone or stage card lands.
  for (const caption of [...phoneCaptions, ...stageCards]) {
    sounds.push({ at: caption.at, name: "ping", volume: 0.65 })
  }
  return sounds.sort((a, b) => a.at - b.at)
}

// --- Timeline ---------------------------------------------------------------

export type Timeline = {
  terminal: TermItem[]
  clips: PhoneClip[]
  ripples: Ripple[]
  captions: Caption[]
  callouts: Callout[]
  cardFans: CardFan[]
  notes: Note[]
  annotations: Annotation[]
  phoneCaptions: PhoneCaption[]
  stageCards: StageCard[]
  spotlights: Spotlight[]
  celebrations: Celebration[]
  sounds: Sound[]
  zoom: Zoom
  phoneStage: PhoneStage
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
  const { pair, story } = buildShots(slices)
  const shots = [...pair, ...story].sort((a, b) => a.at - b.at)
  const clips = buildClips(shots)
  const ripples = buildRipples(shots)
  const captions = buildCaptions(shots)
  const callouts = buildCallouts(shots)
  const cardFans = buildCardFans(shots)
  const notes = buildNotes(shots)
  const annotations = buildAnnotations(shots)
  const phoneCaptions = buildPhoneCaptions(shots)
  const stageCards = buildStageCards()
  const spotlights = buildSpotlights(shots)
  const celebrations = buildCelebrations(shots)
  const sounds = buildSounds(
    shots,
    captions,
    ripples,
    spotlights,
    callouts,
    cardFans,
    notes,
    annotations,
    phoneCaptions,
    stageCards,
  )
  const pairedRenderSec =
    tapRenderSec(pair.find((shot) => shot.slice === "first_confirm")) ??
    pair.find((shot) => shot.slice === "paired")?.at ??
    20.4
  const last = story[story.length - 1]
  const endSec = last.at + last.duration + (last.hold ?? 0)
  return {
    terminal: transcript(pairedRenderSec),
    clips,
    ripples,
    captions,
    callouts,
    cardFans,
    notes,
    annotations,
    phoneCaptions,
    stageCards,
    spotlights,
    celebrations,
    sounds,
    zoom: buildZoom(shots),
    phoneStage: buildPhoneStage(story),
    endSec,
  }
}

export const totalSec = (slices: CaptureSlice[]): number => buildTimeline(slices).endSec + OUTRO_SEC
