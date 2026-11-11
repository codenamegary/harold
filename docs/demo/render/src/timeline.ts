import { Easing } from "remotion"
import {
  poseAt,
  resolveBodyCue,
  type BodyCue,
  type BodyCueSpec,
  type Pose,
  type Waddle,
} from "./body"
import {
  PRESETS,
  cameraAt,
  resolveCameraCue,
  type CameraCue,
  type CameraCueSpec,
  type CameraState,
  type Point,
} from "./camera"
import { LIGHTS, type LightCue, type LightState } from "./stage"

// --- Capture contract -------------------------------------------------------
//
// capture.json is raw material: one video per action, with the exact time of
// every tap, every keystroke and every named mark inside that video. This file is
// the edit. Nothing here re-captures anything.
//
// docs/demo/script.md is the authority. Scene order, copy, stage, camera and
// sound come from it and from nowhere else.

export type CaptureTap = { x: number; y: number; atSec: number }
export type CaptureKey = { atSec: number }
export type CaptureMark = { name: string; atSec: number }

export type CaptureSlice = {
  name: string
  file: string
  durationSec: number
  width: number
  height: number
  still?: boolean
  taps?: CaptureTap[]
  keys?: CaptureKey[]
  marks?: CaptureMark[]
}

export type DemoProps = {
  slices: CaptureSlice[]
  videoWidth: number
  videoHeight: number
}

export const FPS = 30

// --- Scenes -----------------------------------------------------------------

export type SceneSlug =
  | "intro"
  | "ssh"
  | "achievement"
  | "newSession"
  | "plan"
  | "question"
  | "build"
  | "usage"
  | "changes"
  | "worktrees"
  | "pr"
  | "outro"

/** The script's scene order. The achievement sits third, right after the SSH. */
export const SCENE_ORDER: readonly SceneSlug[] = [
  "intro",
  "ssh",
  "achievement",
  "newSession",
  "plan",
  "question",
  "build",
  "usage",
  "changes",
  "worktrees",
  "pr",
  "outro",
] as const

const SCENE_FRAMES: Record<SceneSlug, number> = {
  intro: 105,
  ssh: 600,
  achievement: 225,
  newSession: 180,
  plan: 420,
  question: 180,
  build: 450,
  usage: 150,
  changes: 360,
  worktrees: 105,
  pr: 465,
  outro: 150,
}

/** 3390 frames at 30 fps: 113.0 s. Derived from the beats, not fixed. */
export const DURATION_IN_FRAMES: number = SCENE_ORDER.reduce(
  (sum, slug) => sum + SCENE_FRAMES[slug],
  0,
)
export const DURATION_SEC = DURATION_IN_FRAMES / FPS

// --- Layouts ----------------------------------------------------------------

export type LayoutId = "L1" | "L2C"

export type Layout = {
  id: LayoutId
  columns: "one" | "two"
  /** Copy column, or off. */
  copy: "off" | "left"
  phoneDock: number
}

export const LAYOUTS: Record<LayoutId, Layout> = {
  L1: { id: "L1", columns: "one", copy: "off", phoneDock: 0.5 },
  L2C: { id: "L2C", columns: "two", copy: "left", phoneDock: 0.68 },
}

// --- Copy primitives --------------------------------------------------------

export type CopySide = "left" | "right"

/** Where a callout points, in phone-screen fractions. */
export type Anchor =
  | { mode: "firstTap" }
  | { mode: "point"; x: number; y: number }

type CopyTimes = { /** Scene-relative seconds. */ at: number; hold: number }

export type CopySpec =
  | ({ kind: "card"; title: string; place: "stage" | "screen" } & CopyTimes)
  | ({
      kind: "callout"
      title: string
      eyebrow?: string
      hint?: string
      /** Left unset means the tag sits on the side its target is nearest. */
      side?: CopySide
      compact?: boolean
      placement?: "target" | "edge"
      connector?: "string" | "t"
      anchor?: Anchor
    } & CopyTimes)
  | ({ kind: "spotlight"; side: CopySide; kicker: string; title: string } & CopyTimes)
  | ({ kind: "note"; title: string; label: string } & CopyTimes)
  | ({
      kind: "box"
      steps: { title: string; at: number; x: number; y: number }[]
    } & CopyTimes)
  | ({ kind: "cap"; text: string } & CopyTimes)

export type CardItem = {
  kind: "card"
  at: number
  hold: number
  title: string
  place: "stage" | "screen"
}

export type CalloutItem = {
  kind: "callout"
  at: number
  hold: number
  title: string
  eyebrow?: string
  hint?: string
  side: CopySide
  compact: boolean
  placement: "target" | "edge"
  connector: "string" | "t"
  target: Point
  anchoredBy: "tap" | "point"
}

export type SpotlightItem = {
  kind: "spotlight"
  at: number
  hold: number
  side: CopySide
  kicker: string
  title: string
}

export type NoteItem = {
  kind: "note"
  at: number
  hold: number
  title: string
  label: string
}

export type BoxStep = { title: string; at: number; x: number; y: number }

export type BoxItem = { kind: "box"; at: number; hold: number; steps: BoxStep[] }

export type CapItem = { kind: "cap"; at: number; hold: number; text: string }

export type CopyItem = CardItem | CalloutItem | SpotlightItem | NoteItem | BoxItem | CapItem

// --- Shots ------------------------------------------------------------------

type ShotSpec = {
  slice: string
  /** Scene-relative start, frames, so every cut lands on a whole frame. */
  at: number
  /** First source frame of the slice, seconds. */
  startSec: number
  /** Playback rate. Below 1 slows the capture down. */
  rate: number
  /** Render frames the capture actually plays. The rest of the slot is a hold. */
  play: number
}

export type Shot = {
  scene: SceneSlug
  slice: string
  /** Render start, seconds, absolute. */
  at: number
  /** End of this shot's slot: the next shot, or the end of the scene. */
  until: number
  startSec: number
  rate: number
  duration: number
  /** Drift rate for this shot, percent of frame width per second. */
  drift: number
  data: CaptureSlice
}

type SceneSpec = {
  slug: SceneSlug
  light: LightState
  layout: LayoutId
  /** Percent of frame width per second. Sign alternates between scenes. */
  drift: number
  camera: CameraCueSpec[]
  body: BodyCueSpec[]
  waddle?: { at: number; duration: number }
  shots: ShotSpec[]
  copy: CopySpec[]
}

// --- The cut ----------------------------------------------------------------
//
// Every scene names its light state, its layout, its camera, what the phone does
// in the light, and the copy its beats call for. Shot `at` is in frames; every
// other scene-relative time is in seconds.

const SCENE_SPECS: SceneSpec[] = [
  // -- intro ----------------------------------------------------------------
  {
    slug: "intro",
    light: "alone",
    layout: "L1",
    drift: 1.8,
    camera: [{ at: 0, preset: "full" }],
    body: [],
    shots: [],
    copy: [],
  },

  // -- SSH Host Connection ---------------------------------------------------
  //
  // The intro slide fades out and the app on the phone moves into the light with
  // a waddle, lit from one side, and settles just off centre. The camera then
  // zooms so the phone fits the frame vertically, centred horizontally.
  {
    slug: "ssh",
    light: "arrival",
    layout: "L1",
    drift: -1.6,
    camera: [
      { at: 0, preset: "full", scale: 0.88, dock: 0.34 },
      { at: 1.8, preset: "full", dock: 0.5 },
    ],
    body: [
      { at: 0, pose: { rotateZ: -5, rotateY: 12, y: 34, scale: 0.94 } },
      { at: 0.7, pose: { rotateZ: 3, rotateY: 6 } },
      { at: 1.5, pose: { rotateY: 3 } },
      { at: 2.6, pose: {} },
    ],
    waddle: { at: 0, duration: 1.5 },
    shots: [
      // The app's own order: the empty form, the public key it generates, the
      // form filled, the test, the trust tick, the save, the home screen.
      { slice: "connect_empty", at: 0, startSec: 0.88, rate: 1, play: 66 },
      { slice: "connect_key", at: 66, startSec: 0.83, rate: 0.6, play: 72 },
      { slice: "connect_fill", at: 138, startSec: 0.9, rate: 0.55, play: 66 },
      { slice: "connect_fill", at: 204, startSec: 8.62, rate: 0.5, play: 78 },
      { slice: "connect_test", at: 282, startSec: 2.0, rate: 0.7, play: 66 },
      { slice: "connect_test", at: 348, startSec: 3.42, rate: 0.6, play: 66 },
      { slice: "connect_trust", at: 414, startSec: 0.9, rate: 1, play: 60 },
      { slice: "connect_save", at: 474, startSec: 1.1, rate: 1, play: 60 },
      { slice: "landing", at: 534, startSec: 1.1, rate: 0.75, play: 66 },
    ],
    copy: [
      {
        kind: "card",
        at: 1.4,
        hold: 3.4,
        title: "Harold over SSH to your agent hosts",
        place: "stage",
      },
    ],
  },

  // -- achievement -----------------------------------------------------------
  //
  // The hinge. Pool blooms to the full stage, the haze flares, the camera pushes
  // in with the phone, and the confetti falls in the light. One pop, one
  // confetti, both silent.
  {
    slug: "achievement",
    light: "reward",
    layout: "L2C",
    drift: 1.7,
    camera: [{ at: 0, preset: "center-two-thirds", dock: 0.66 }],
    body: [
      { at: 0, pose: { rotateY: -9, scale: 0.97 } },
      { at: 1, pose: {} },
    ],
    shots: [{ slice: "landing", at: 0, startSec: 2.75, rate: 0.6, play: 110 }],
    copy: [
      {
        kind: "spotlight",
        at: 0.5,
        hold: 6,
        side: "left",
        kicker: "Achievement unlocked",
        title: "Work from Couch",
      },
    ],
  },

  // -- new-session -----------------------------------------------------------
  //
  // The phone returns to centre. The session menu opens on the cat history, the
  // new session form enlarges the phone, and the chat opening pulls it back.
  {
    slug: "newSession",
    light: "work",
    layout: "L1",
    drift: -1.6,
    camera: [
      { at: 0, preset: "full" },
      // The form is on screen from source 2.0 to 3.8: push in when it opens and
      // pull back when the chat takes over.
      { at: 1.9, preset: "center-two-thirds" },
      { at: 3.6, preset: "full" },
    ],
    body: [
      { at: 0, pose: { x: -26 } },
      { at: 1.2, pose: { rotateY: -5, scale: 1.01 } },
      { at: 3.2, pose: {} },
    ],
    shots: [
      { slice: "new_session", at: 0, startSec: 0.9, rate: 1, play: 66 },
      { slice: "new_session", at: 66, startSec: 3.1, rate: 1, play: 48 },
      { slice: "new_session", at: 114, startSec: 4.7, rate: 1, play: 30 },
    ],
    copy: [
      // The note lands while the session menu is open, and slides back before
      // the form replaces it.
      { kind: "note", at: 0.6, hold: 2.4, title: "Start something new", label: "NEW SESSION" },
    ],
  },

  // -- plan ------------------------------------------------------------------
  //
  // The composer shows the model and mode chips. The phone leans in towards the
  // light while the prompt is typed: two real windows at 6.6 characters a
  // second, then cut ahead rather than slow the capture down.
  {
    slug: "plan",
    light: "work",
    layout: "L1",
    drift: 1.8,
    camera: [{ at: 0, preset: "full" }],
    body: [
      { at: 0, pose: {} },
      { at: 1.6, pose: { rotateY: -7, rotateX: 3, scale: 1.03, y: 8 } },
    ],
    shots: [
      { slice: "plan", at: 0, startSec: 0.85, rate: 0.55, play: 126 },
      { slice: "plan", at: 126, startSec: 26.0, rate: 0.55, play: 120 },
      { slice: "plan", at: 246, startSec: 28.2, rate: 0.5, play: 90 },
      { slice: "plan", at: 336, startSec: 29.7, rate: 0.6, play: 60 },
    ],
    copy: [
      {
        kind: "callout",
        at: 0.4,
        hold: 2.6,
        eyebrow: "PLAN",
        title: "Use your agent’s plan mode",
        side: "right",
        anchor: { mode: "point", x: 0.79, y: 0.72 },
      },
      {
        kind: "callout",
        at: 9.2,
        hold: 2.4,
        eyebrow: "ATTACHMENTS",
        title: "Give it the spec",
        hint: "A markdown file and a photo of Mia.",
        side: "right",
        compact: true,
        placement: "edge",
        connector: "t",
        // The attached-files row in the composer, not the blank space above it.
        anchor: { mode: "point", x: 0.5, y: 0.757 },
      },
    ],
  },

  // -- question --------------------------------------------------------------
  //
  // Played at 1.0x, the capture's own speed. The sheet opening is a short hold,
  // not a slow motion.
  {
    slug: "question",
    light: "work",
    layout: "L1",
    drift: -1,
    camera: [{ at: 0, preset: "full" }],
    body: [
      { at: 0, pose: { rotateY: 5, rotateX: -2, scale: 0.985, y: -8 } },
      { at: 3.2, pose: {} },
    ],
    shots: [
      { slice: "question", at: 0, startSec: 1.15, rate: 1, play: 60 },
      { slice: "question", at: 60, startSec: 3.15, rate: 1, play: 40 },
      { slice: "question", at: 100, startSec: 4.45, rate: 1, play: 30 },
    ],
    copy: [
      {
        kind: "callout",
        at: 0.4,
        hold: 2.8,
        eyebrow: "AGENT QUESTION",
        title: "Get grilled",
        hint: "Interactive question tooling.",
        // The tag sits on the side the dot lands on, so its leader crosses one
        // bezel. The dot is at the left end of the question row.
        side: "left",
        // The question panel, not the transcript above it. The dot lands on the
        // left end of the "How should cat mode turn on?" row, clear of the
        // "Required" label at the right end.
        anchor: { mode: "point", x: 0.22, y: 0.775 },
      },
    ],
  },

  // -- build -----------------------------------------------------------------
  //
  // The phone holds still and watches the work happen. Two real typing windows,
  // then the send and the settled reply.
  {
    slug: "build",
    light: "work",
    layout: "L1",
    drift: 1.8,
    camera: [{ at: 0, preset: "full" }],
    body: [{ at: 0, pose: { rotateX: 2, scale: 1.01 } }],
    shots: [
      { slice: "build", at: 0, startSec: 0.85, rate: 0.55, play: 135 },
      { slice: "build", at: 135, startSec: 18.5, rate: 0.55, play: 120 },
      { slice: "build", at: 255, startSec: 20.7, rate: 0.55, play: 90 },
      { slice: "build", at: 345, startSec: 22.4, rate: 0.7, play: 80 },
      { slice: "build", at: 425, startSec: 24.3, rate: 0.6, play: 25 },
    ],
    copy: [
      {
        kind: "callout",
        at: 0.4,
        hold: 2.6,
        eyebrow: "BUILD",
        title: "Execute the plan",
        side: "right",
        anchor: { mode: "point", x: 0.79, y: 0.76 },
      },
    ],
  },

  // -- usage -----------------------------------------------------------------
  //
  // The pool tightens to the top of the phone. The script's own framing: the
  // upper-centre preset with scale and focus overridden onto the cost line.
  {
    slug: "usage",
    light: "work",
    layout: "L1",
    drift: -1.6,
    camera: [
      { at: 0, preset: "upper-center", scale: 2.2, focus: { x: 0.5, y: 0.08 } },
    ],
    body: [{ at: 0, pose: { rotateX: 7, y: 6 } }],
    shots: [{ slice: "usage", at: 0, startSec: 0.88, rate: 0.55, play: 150 }],
    copy: [
      {
        kind: "callout",
        at: 0.4,
        hold: 3.6,
        eyebrow: "USAGE",
        title: "Know what it cost",
        hint: "Tokens and dollars, in the header.",
        side: "left",
        compact: true,
        placement: "edge",
        connector: "t",
        anchor: { mode: "point", x: 0.5, y: 0.1325 },
      },
    ],
  },

  // -- changes ---------------------------------------------------------------
  //
  // The phone turns slightly to present its screen. The empty scope, the branch
  // scope, then the settings.js diff at the full framing the script asks for.
  {
    slug: "changes",
    light: "work",
    layout: "L1",
    drift: 1.7,
    camera: [{ at: 0, preset: "full" }],
    body: [
      { at: 0, pose: { rotateY: -10 } },
      { at: 0.8, pose: {} },
    ],
    shots: [
      { slice: "changes", at: 0, startSec: 0.9, rate: 1, play: 60 },
      { slice: "changes", at: 60, startSec: 2.9, rate: 1, play: 60 },
      { slice: "changes", at: 120, startSec: 4.9, rate: 0.8, play: 60 },
      { slice: "changes", at: 180, startSec: 7.3, rate: 0.6, play: 108 },
      { slice: "changes", at: 288, startSec: 9.46, rate: 0.8, play: 36 },
      { slice: "changes", at: 324, startSec: 10.42, rate: 1, play: 20 },
    ],
    copy: [
      {
        kind: "callout",
        at: 0.3,
        hold: 2.4,
        eyebrow: "CHANGES",
        title: "Review the code",
        side: "left",
        anchor: { mode: "point", x: 0.25, y: 0.088 },
      },
      {
        kind: "callout",
        at: 6.2,
        hold: 2.4,
        eyebrow: "CHANGES",
        title: "Pretty diffs!",
        side: "right",
        compact: true,
        placement: "edge",
        connector: "t",
        anchor: { mode: "point", x: 0.5, y: 0.3 },
      },
    ],
  },

  // -- worktrees -------------------------------------------------------------
  //
  // The Changes list is back. The pool holds and the haze drifts through the
  // light while the sheet lists main and feat/cat-mode.
  {
    slug: "worktrees",
    light: "work",
    layout: "L1",
    drift: -1.7,
    camera: [{ at: 0, preset: "full" }],
    body: [{ at: 0, pose: {} }],
    shots: [
      { slice: "worktrees", at: 0, startSec: 0.8, rate: 1, play: 36 },
      { slice: "worktrees", at: 90, startSec: 2.1, rate: 1, play: 15 },
    ],
    copy: [
      {
        kind: "callout",
        at: 0.4,
        hold: 2.4,
        eyebrow: "WORKTREES",
        title: "Auto-detect, or choose",
        hint: "Pick the worktree to inspect.",
        side: "right",
        compact: true,
        placement: "edge",
        connector: "t",
        anchor: { mode: "point", x: 0.5, y: 0.75 },
      },
    ],
  },

  // -- pr --------------------------------------------------------------------
  //
  // The pool opens wide and the phone sits small in a large lit field. The last
  // thing it does has room, and the film closes on the script's own spotlight.
  {
    slug: "pr",
    light: "full",
    layout: "L1",
    drift: 1.7,
    camera: [{ at: 0, preset: "full" }],
    body: [{ at: 0, pose: {} }],
    shots: [
      { slice: "pr", at: 0, startSec: 0.88, rate: 0.55, play: 120 },
      { slice: "pr", at: 120, startSec: 5.4, rate: 0.55, play: 120 },
      { slice: "pr", at: 240, startSec: 7.6, rate: 0.55, play: 75 },
      { slice: "pr", at: 315, startSec: 8.98, rate: 0.7, play: 75 },
      { slice: "pr", at: 390, startSec: 10.7, rate: 0.6, play: 40 },
    ],
    copy: [
      {
        kind: "callout",
        at: 0.4,
        hold: 2.6,
        eyebrow: "DRAFT PR",
        title: "Just like always",
        hint: "The agent pushes and opens it.",
        side: "right",
        compact: true,
        placement: "edge",
        connector: "t",
        anchor: { mode: "point", x: 0.872, y: 0.78 },
      },
      {
        kind: "spotlight",
        at: 10.5,
        hold: 5,
        side: "left",
        kicker: "The whole loop",
        title: "From plan to PR",
      },
    ],
  },

  // -- outro -----------------------------------------------------------------
  {
    slug: "outro",
    light: "alone",
    layout: "L1",
    drift: -1.7,
    camera: [{ at: 0, preset: "full" }],
    body: [],
    shots: [],
    copy: [],
  },
]

// --- The prompt text --------------------------------------------------------
//
// [KR] text, verbatim from the script. Nothing renders these strings: the typing
// on screen is the capture's own keystrokes. They are kept so the cut can prove
// it played the prompt the script asked for, and that it cut ahead of the rest
// instead of slowing it down.

export const KEYBURSTS = {
  plan: "Read the attached spec and the photo of Mia. Plan only; do not edit files. Plan a small cat mode for this screensaver. Do not build yet. Use your question tool exactly once, for one question only: should cat mode be a settings toggle or automatic? The options must be exactly Settings toggle and Automatic. Do not ask about anything else.",
  build:
    "Settings toggle. Implement only the plan now. Put the toggle in src/settings.js, put the cat behavior in src/cat-mode.js, add tests, and commit every change on feat/cat-mode so the worktree is clean. Do not add unrelated features and do not open a PR.",
  pr: "Push feat/cat-mode and open a draft PR against main with gh. End with the PR URL.",
} as const

// --- Shots ------------------------------------------------------------------

export type Scene = {
  slug: SceneSlug
  from: number
  to: number
  frames: number
  light: LightState
  layout: LayoutId
  drift: number
}

const buildScenes = (): Scene[] => {
  let cursor = 0
  return SCENE_ORDER.map((slug) => {
    const spec = SCENE_SPECS.find((entry) => entry.slug === slug)
    if (spec === undefined) {
      throw new Error(`scene ${slug} has no spec`)
    }
    const frames = SCENE_FRAMES[slug]
    const scene: Scene = {
      slug,
      from: cursor / FPS,
      to: (cursor + frames) / FPS,
      frames,
      light: spec.light,
      layout: spec.layout,
      drift: spec.drift,
    }
    cursor += frames
    return scene
  })
}

export const SCENES: Scene[] = buildScenes()

export const sceneAt = (scenes: Scene[], sec: number): Scene => {
  let current = scenes[0]
  for (const scene of scenes) {
    if (sec < scene.from) {
      break
    }
    current = scene
  }
  return current
}

const buildShots = (slices: CaptureSlice[]): Shot[] => {
  const byName = new Map(slices.map((slice) => [slice.name, slice]))
  const shots: Shot[] = []
  for (const spec of SCENE_SPECS) {
    const scene = SCENES.find((entry) => entry.slug === spec.slug)
    if (scene === undefined) {
      continue
    }
    for (let index = 0; index < spec.shots.length; index += 1) {
      const shotSpec = spec.shots[index]
      const data = byName.get(shotSpec.slice)
      if (data === undefined) {
        // A slice the capture does not have drops its shot; the cut still builds.
        continue
      }
      const next = spec.shots[index + 1]
      const at = scene.from + shotSpec.at / FPS
      const until = next === undefined ? scene.to : scene.from + next.at / FPS
      const rate = shotSpec.rate
      const startSec = data.still ? 0 : shotSpec.startSec
      const remaining = Math.max(0.05, data.durationSec - startSec)
      const available = data.still ? data.durationSec : remaining / rate
      const duration = Math.max(0.05, Math.min(shotSpec.play / FPS, available))
      shots.push({
        scene: spec.slug,
        slice: shotSpec.slice,
        at,
        until,
        startSec,
        rate,
        duration,
        drift: spec.drift,
        data,
      })
    }
  }
  return shots.sort((a, b) => a.at - b.at)
}

// --- Drift ------------------------------------------------------------------
//
// The camera drifts at a constant rate, authored as a percentage of frame width
// per second. The accumulator restarts on every cut, so a shot pans at one speed
// and the cut absorbs the reset. The pool and the haze are offset from this same
// value at different parallax factors, never at the camera's own speed.

export const driftAt = (scenes: Scene[], shots: Shot[], sec: number, stageWidth: number): Point => {
  const scene = sceneAt(scenes, sec)
  let origin = scene.from
  for (const shot of shots) {
    if (sec >= shot.at && sec < shot.until) {
      origin = shot.at
      break
    }
  }
  return {
    x: ((scene.drift / 100) * stageWidth * (sec - origin)),
    y: 0,
  }
}

// --- Phone clips ------------------------------------------------------------

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

const buildClips = (shots: Shot[]): PhoneClip[] => {
  const clips: PhoneClip[] = []
  for (const shot of shots) {
    const playDuration = Math.max(0, Math.min(shot.duration, shot.until - shot.at))
    if (shot.data.still) {
      clips.push({ kind: "hold", file: shot.data.file, from: shot.at, duration: playDuration, atSec: 0 })
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
    if (shot.until > holdStart + 0.001) {
      clips.push({
        kind: "hold",
        file: shot.data.file,
        from: holdStart,
        duration: shot.until - holdStart,
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

/** The one place a source second becomes a render second. */
export const clipFrame = (clip: PhoneClip, sec: number): number => {
  if (clip.kind === "hold") {
    return clip.atSec
  }
  return Math.max(0, clip.startSec + (sec - clip.from) * clip.rate)
}

// --- Keyframes --------------------------------------------------------------

export type Keyframes = [number, number][]

const keyframeEase = Easing.bezier(0.16, 1, 0.3, 1)

/** Value of a keyframe channel at `sec`, eased between keyframes, clamped. */
export const channel = (keyframes: Keyframes, sec: number): number => {
  if (keyframes.length === 0) {
    return 0
  }
  if (sec <= keyframes[0][0]) {
    return keyframes[0][1]
  }
  for (let index = 1; index < keyframes.length; index += 1) {
    const [to, valueTo] = keyframes[index]
    if (sec <= to) {
      const [from, valueFrom] = keyframes[index - 1]
      const progress = (to - from) <= 0 ? 1 : (sec - from) / (to - from)
      return valueFrom + (valueTo - valueFrom) * keyframeEase(progress)
    }
  }
  return keyframes[keyframes.length - 1][1]
}

const OUTRO = SCENES[SCENES.length - 1]

/** The phone fades out as the outro card fades in. */
export const phoneFade: Keyframes = [
  [OUTRO.from, 1],
  [OUTRO.from + 0.45, 0],
]

/** The intro slide hands the stage to the phone. */
export const slideFade = 0.4

// --- Camera and body cues ---------------------------------------------------

const buildCameraCues = (): CameraCue[] => {
  const cues: CameraCue[] = []
  for (const spec of SCENE_SPECS) {
    const scene = SCENES.find((entry) => entry.slug === spec.slug)
    if (scene === undefined) {
      continue
    }
    let previous = PRESETS.full
    for (const cue of spec.camera) {
      const resolved = resolveCameraCue(cue, previous)
      cues.push({ at: scene.from + cue.at, state: resolved })
      previous = resolved
    }
  }
  return cues.sort((a, b) => a.at - b.at)
}

const buildBodyCues = (): BodyCue[] => {
  const cues: BodyCue[] = []
  for (const spec of SCENE_SPECS) {
    const scene = SCENES.find((entry) => entry.slug === spec.slug)
    if (scene === undefined || spec.body.length === 0) {
      continue
    }
    for (const cue of spec.body) {
      cues.push({ at: scene.from + cue.at, pose: resolveBodyCue(cue).pose })
    }
  }
  return cues.sort((a, b) => a.at - b.at)
}

export type WaddleCue = Waddle

const buildWaddles = (): WaddleCue[] => {
  const cues: WaddleCue[] = []
  for (const spec of SCENE_SPECS) {
    if (spec.waddle === undefined) {
      continue
    }
    const scene = SCENES.find((entry) => entry.slug === spec.slug)
    if (scene === undefined) {
      continue
    }
    cues.push({ at: scene.from + spec.waddle.at, duration: spec.waddle.duration })
  }
  return cues
}

// --- Events derived from the capture ---------------------------------------

export type TapEvent = { at: number; x: number; y: number; slice: string }
export type KeyEvent = { at: number; slice: string }
export type Ripple = { at: number; x: number; y: number }

export const rippleDuration = 0.55
export const rippleColor = "#B6F36B"

/** Source second inside a shot -> render second. The inverse of `clipFrame`. */
const toRenderSec = (shot: Shot, sourceSec: number): number =>
  shot.at + (sourceSec - shot.startSec) / shot.rate

const reachesSource = (shot: Shot, sourceSec: number): boolean =>
  sourceSec >= shot.startSec - 1e-6 &&
  sourceSec <= shot.startSec + shot.duration * shot.rate + 1e-6

const buildTaps = (shots: Shot[]): TapEvent[] => {
  const taps: TapEvent[] = []
  for (const shot of shots) {
    for (const tap of shot.data.taps ?? []) {
      if (!reachesSource(shot, tap.atSec)) {
        continue
      }
      taps.push({
        at: toRenderSec(shot, tap.atSec),
        x: tap.x / shot.data.width,
        y: tap.y / shot.data.height,
        slice: shot.slice,
      })
    }
  }
  return taps.sort((a, b) => a.at - b.at)
}

const buildKeys = (shots: Shot[]): KeyEvent[] => {
  const keys: KeyEvent[] = []
  for (const shot of shots) {
    for (const key of shot.data.keys ?? []) {
      if (!reachesSource(shot, key.atSec)) {
        continue
      }
      keys.push({ at: toRenderSec(shot, key.atSec), slice: shot.slice })
    }
  }
  return keys.sort((a, b) => a.at - b.at)
}

// --- Copy -------------------------------------------------------------------
//
// A callout anchors to the first tap of its shot. Where the footage ships no
// taps — every slice after `connect_save` — the script's own `targetX`/`targetY`
// override is used instead, measured off the captured frames.

export const firstTapAnchor = (shots: Shot[], at: number): Point | null => {
  const shot = shots.find((entry) => at >= entry.at - 1e-9 && at < entry.until - 1e-9)
  if (shot === undefined) {
    return null
  }
  const inside = (shot.data.taps ?? [])
    .filter((tap) => reachesSource(shot, tap.atSec))
    .sort((a, b) => a.atSec - b.atSec)
  const first = inside[0]
  if (first === undefined) {
    return null
  }
  return { x: first.x / shot.data.width, y: first.y / shot.data.height }
}

const buildCopy = (shots: Shot[]): CopyItem[] => {
  const items: CopyItem[] = []
  for (const spec of SCENE_SPECS) {
    const scene = SCENES.find((entry) => entry.slug === spec.slug)
    if (scene === undefined) {
      continue
    }
    for (const item of spec.copy) {
      const at = scene.from + item.at
      switch (item.kind) {
        case "card":
          items.push({ ...item, at })
          break
        case "note":
          items.push({ ...item, at })
          break
        case "cap":
          items.push({ ...item, at })
          break
        case "spotlight":
          items.push({ ...item, at })
          break
        case "box":
          items.push({
            ...item,
            at,
            steps: item.steps.map((step) => ({ ...step, at: at + step.at })),
          })
          break
        case "callout": {
          const anchor = item.anchor ?? { mode: "firstTap" }
          const tapped = anchor.mode === "firstTap" ? firstTapAnchor(shots, at) : null
          const target =
            anchor.mode === "point"
              ? { x: anchor.x, y: anchor.y }
              : (tapped ?? { x: 0.5, y: 0.5 })
          items.push({
            kind: "callout",
            at,
            hold: item.hold,
            title: item.title,
            eyebrow: item.eyebrow,
            hint: item.hint,
            // A tag sits on the side of the phone its target is on, so the
            // leader line crosses the nearest bezel and never the whole screen.
            side: item.side ?? (target.x > 0.5 ? "right" : "left"),
            compact: item.compact ?? false,
            placement: item.placement ?? "target",
            connector: item.connector ?? "string",
            target,
            anchoredBy: anchor.mode === "point" ? "point" : tapped === null ? "point" : "tap",
          })
          break
        }
      }
    }
  }
  return items.sort((a, b) => a.at - b.at)
}

export const callouts = (items: CopyItem[]): CalloutItem[] =>
  items.filter((item): item is CalloutItem => item.kind === "callout")

export const spotlights = (items: CopyItem[]): SpotlightItem[] =>
  items.filter((item): item is SpotlightItem => item.kind === "spotlight")

export const cards = (items: CopyItem[]): CardItem[] =>
  items.filter((item): item is CardItem => item.kind === "card")

export const notes = (items: CopyItem[]): NoteItem[] =>
  items.filter((item): item is NoteItem => item.kind === "note")

export const boxes = (items: CopyItem[]): BoxItem[] =>
  items.filter((item): item is BoxItem => item.kind === "box")

export const caps = (items: CopyItem[]): CapItem[] =>
  items.filter((item): item is CapItem => item.kind === "cap")

// --- Celebration ------------------------------------------------------------

export type Celebration = {
  at: number
  hold: number
  strength: number
  confetti: boolean
  confettiHold: number
}

export type Confetti = { at: number; hold: number; count: number }

const ACHIEVEMENT = SCENES[2]

// The film's only pop and its only confetti. Both silent.
export const CELEBRATION_AT = ACHIEVEMENT.from + 0.6

const CELEBRATIONS: Celebration[] = [
  { at: CELEBRATION_AT, hold: 1.5, strength: 1, confetti: true, confettiHold: 4.6 },
]

const buildConfetti = (celebrations: Celebration[]): Confetti[] =>
  celebrations
    .filter((celebration) => celebration.confetti)
    .map((celebration) => ({ at: celebration.at, hold: celebration.confettiHold, count: 96 }))

// --- Light ------------------------------------------------------------------

const LIGHT_BY_SCENE: Record<SceneSlug, LightState> = SCENE_SPECS.reduce(
  (table, spec) => ({ ...table, [spec.slug]: spec.light }),
  {} as Record<SceneSlug, LightState>,
)

const buildLightCues = (): LightCue[] =>
  SCENES.map((scene) => ({ at: scene.from, state: LIGHT_BY_SCENE[scene.slug] }))

export const LIGHT_CUES: LightCue[] = buildLightCues()

export const LIGHT_SHAPES = LIGHTS

// --- Sounds -----------------------------------------------------------------
//
// Three sources only: a ping for every copy primitive, the real taps, and the
// real keystrokes. [POP] and [CF] are silent by design.
//
// The bed is normalised against these, not the other way round. music.mp3
// measures -10.43 LUFS integrated with a +0.80 dBTP peak, so MUSIC_VOLUME lands
// it at -26.3 LUFS, a measured 11 dB below a tap.

export type SoundName = "key" | "tap" | "ping"
export type Sound = { at: number; name: SoundName; volume: number }

export const MUSIC_VOLUME = 0.16

/** Two keys closer together than this are one keystroke too many. */
const KEY_CROWD_SEC = 0.16

const pingVolume = (kind: CopyItem["kind"]): number => {
  switch (kind) {
    case "spotlight":
      return 0.7
    case "card":
      return 0.6
    case "callout":
      return 0.55
    case "note":
      return 0.5
    case "box":
      return 0.55
    case "cap":
      return 0.45
  }
}

const buildSounds = (taps: TapEvent[], keys: KeyEvent[], copy: CopyItem[]): Sound[] => {
  const sounds: Sound[] = []
  let lastKept = Number.NEGATIVE_INFINITY
  for (const key of keys) {
    if (key.at - lastKept <= KEY_CROWD_SEC) {
      continue
    }
    const fresh = key.at - lastKept > 0.6
    lastKept = key.at
    sounds.push({ at: key.at, name: "key", volume: fresh ? 0.78 : 0.58 })
  }
  for (const tap of taps) {
    sounds.push({ at: tap.at, name: "tap", volume: 0.9 })
  }
  for (const item of copy) {
    if (item.kind === "box") {
      for (const step of item.steps) {
        sounds.push({ at: step.at, name: "ping", volume: pingVolume("box") })
      }
      continue
    }
    sounds.push({ at: item.at, name: "ping", volume: pingVolume(item.kind) })
  }
  return sounds.sort((a, b) => a.at - b.at)
}

// --- Timeline ---------------------------------------------------------------

export type Timeline = {
  scenes: Scene[]
  shots: Shot[]
  clips: PhoneClip[]
  taps: TapEvent[]
  keys: KeyEvent[]
  ripples: Ripple[]
  copy: CopyItem[]
  celebrations: Celebration[]
  confetti: Confetti[]
  sounds: Sound[]
  lights: LightCue[]
  cameras: CameraCue[]
  bodies: BodyCue[]
  waddles: WaddleCue[]
  poseAt: (sec: number) => Pose
  cameraAt: (sec: number) => CameraState
  driftAt: (sec: number, stageWidth: number) => Point
  sceneAt: (sec: number) => Scene
  endSec: number
}

/** The drifts that skip a shot that could not be drawn still alternate. */
const CAMERA_CUES = buildCameraCues()
const BODY_CUES = buildBodyCues()
const WADDLES = buildWaddles()

/**
 * The whole cut, derived from the captured slices. Never throws: a slice that is
 * missing from the capture drops its shot and the rest of the edit stands.
 */
export const buildTimeline = (slices: CaptureSlice[]): Timeline => {
  const shots = buildShots(slices)
  const taps = buildTaps(shots)
  const keys = buildKeys(shots)
  const copy = buildCopy(shots)
  return {
    scenes: SCENES,
    shots,
    clips: buildClips(shots),
    taps,
    keys,
    copy,
    ripples: taps.map((tap) => ({ at: tap.at, x: tap.x, y: tap.y })),
    celebrations: CELEBRATIONS,
    confetti: buildConfetti(CELEBRATIONS),
    sounds: buildSounds(taps, keys, copy),
    lights: LIGHT_CUES,
    cameras: CAMERA_CUES,
    bodies: BODY_CUES,
    waddles: WADDLES,
    poseAt: (sec: number) => poseAt(BODY_CUES, sec),
    cameraAt: (sec: number) => cameraAt(CAMERA_CUES, sec),
    driftAt: (sec: number, stageWidth: number) => driftAt(SCENES, shots, sec, stageWidth),
    sceneAt: (sec: number) => sceneAt(SCENES, sec),
    endSec: DURATION_SEC,
  }
}

// --- Capture contract -------------------------------------------------------

const editSlices = (): string[] => {
  const names: string[] = []
  for (const spec of SCENE_SPECS) {
    for (const shot of spec.shots) {
      if (names.indexOf(shot.slice) === -1) {
        names.push(shot.slice)
      }
    }
  }
  return names
}

/** Every slice the edit asks for. Tests assert this against capture.json. */
export const EDIT_SLICES: string[] = editSlices()

export const missingSlices = (slices: CaptureSlice[]): string[] => {
  const have = new Set(slices.map((slice) => slice.name))
  return EDIT_SLICES.filter((name) => !have.has(name))
}

/** Frames a scene holds the stage. Used by the tests and the README table. */
export const sceneFrames = (slug: SceneSlug): number => SCENE_FRAMES[slug]
