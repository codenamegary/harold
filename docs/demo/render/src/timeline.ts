import { Easing } from "remotion"
import { markAt, slice } from "./capture"
import {
  poseAt,
  resolveBodyCue,
  type BodyCue,
  type BodyCueSpec,
  type Pose,
  type Waddle,
} from "./body"
import {
  CAMERA_EASE_SEC,
  ENTRANCE_SCALE,
  PRESETS,
  VERTICAL_FIT,
  cameraAt,
  resolveCameraCue,
  type CameraCue,
  type CameraCueSpec,
  type CameraState,
  type Point,
} from "./camera"
import {
  INTRO_FRAMES,
  SSH_CARD_HOLD_SEC,
  SSH_CARD_SEC,
  SSH_HOME_HOLD_SEC,
  openingIdleFrozenAt,
} from "./opening"
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

/**
 * Scenes with no phone recording. Their length is the card, not the capture.
 * Every other scene is as long as the slices it plays.
 */
const GRAPHIC_FRAMES: Partial<Record<SceneSlug, number>> = {
  intro: INTRO_FRAMES,
  outro: 150,
}

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
      /** The mark at the target. `rounded` outlines a control instead of covering it. */
      targetShape?: "dot" | "rounded"
      /** Rounded-target size, in phone-screen fractions. */
      targetSize?: { width: number; height: number }
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
  targetShape: "dot" | "rounded"
  targetSize: { width: number; height: number } | null
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
  /** Source second to start at. `"firstTap"` / `"lastTap"` cut on that slice's taps. */
  from?: number | "firstTap" | "lastTap"
  /** Source second to stop at, exclusive of a following shot that starts there. */
  to?: number | "firstTap" | "lastTap"
  /** Hold this one source frame for `holdSec` instead of playing. */
  holdAtSec?: number
  holdSec?: number
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
  /** A hold shows one frame. It does not replay the slice's taps or keys. */
  hold: boolean
  /**
   * Render each tap this many seconds before the frame it caused. A ripple
   * starts on the control before a menu closes on the same tap, so the tap reads
   * on the row instead of floating over whatever replaced it.
   */
  tapLead: number
  /** Per-tap leads, in tap order. Falls back to `tapLead`. */
  tapLeads?: readonly number[]
  /** Drift rate for this shot, percent of frame width per second. */
  drift: number
  data: CaptureSlice
}

type SceneSpec = {
  slug: SceneSlug
  light: LightState
  /** Extra light cues, scene-relative seconds. The scene still opens on `light`. */
  lights?: { at: number; state: LightState }[]
  layout: LayoutId
  /** Percent of frame width per second. Sign alternates between scenes. */
  drift: number
  camera: CameraCueSpec[]
  body: BodyCueSpec[]
  waddle?: { at: number; duration: number }
  shots: ShotSpec[]
  /**
   * Each tap ripples this many seconds before the frame it caused. Scenes whose
   * taps dismiss a menu use a lead so the ripple is seen on the row.
   */
  tapLeadSec?: number
  /** Per-tap leads, in tap order. Overrides `tapLeadSec` for those taps. */
  tapLeadsSec?: readonly number[]
  copy: CopySpec[]
}

// --- The cut ----------------------------------------------------------------
//
// Every scene names its light state, its layout, its shots, and its copy. The
// camera and body cues here are the cut's reference: the act modules own the
// runtime camera, light, and body, and the act tests compare back to these.
// Shot `at` is in frames; every other scene-relative time is in seconds.

const SCENE_SPECS: SceneSpec[] = [
  // -- intro ----------------------------------------------------------------
  //
  // The phone is not on stage yet. The camera is already at the entrance size,
  // so the handset is born small and further back instead of shrinking into the walk.
  {
    slug: "intro",
    light: "alone",
    layout: "L1",
    drift: 1.8,
    camera: [{ at: 0, preset: "full", scale: ENTRANCE_SCALE, dock: 0.5 }],
    body: [],
    shots: [],
    copy: [],
  },

  // -- SSH Host Connection ---------------------------------------------------
  //
  // Capture cut only. Walk, punch, tap, and the pool slide live in `opening.ts`,
  // and so do the home hold and the card times, because the walk sets them.
  // The last camera here is the handoff into the achievement: filled frame,
  // centred, so the next ease does not snap.
  {
    slug: "ssh",
    light: "arrival",
    layout: "L1",
    drift: -1.6,
    camera: [{ at: 0, preset: "full", scale: VERTICAL_FIT, dock: 0.5 }],
    body: [{ at: 0, pose: {} }],
    shots: [
      { slice: "home_empty", holdAtSec: 0.8, holdSec: SSH_HOME_HOLD_SEC },
      { slice: "connect", to: "lastTap" },
    ],
    copy: [
      {
        kind: "card",
        at: SSH_CARD_SEC,
        hold: SSH_CARD_HOLD_SEC,
        title: "Look what I can do!",
        place: "stage",
      },
    ],
  },

  // -- achievement -----------------------------------------------------------
  //
  // Begins on the Save SSH host tap. The pool bloom, camera move, lean, and pop
  // live in `achievement.ts`, along with the handoff from the opening. The
  // camera and body here are the states new-session eases from. The save
  // recording keeps playing, so the form leaves and the home screen arrives
  // inside the move. Then the landing hold.
  {
    slug: "achievement",
    light: "reward",
    layout: "L2C",
    drift: 1.7,
    camera: [{ at: 0, preset: "center-two-thirds", dock: 0.66 }],
    body: [{ at: 0, pose: {} }],
    shots: [{ slice: "connect", from: "lastTap" }, { slice: "landing" }],
    copy: [
      {
        kind: "spotlight",
        at: 0.4,
        hold: 5.4,
        side: "left",
        kicker: "Achievement unlocked",
        title: "Work from Couch",
      },
    ],
  },

  // -- new-session -----------------------------------------------------------
  //
  // The phone returns to centre and holds. The session menu opens on the cat
  // history, the form enlarges the phone, and the chat opening pulls it back.
  // The camera moves, the light handoff, and the pose live in `newSession.ts`.
  // The camera and body here are the states plan starts from.
  {
    slug: "newSession",
    light: "work",
    layout: "L1",
    drift: -1.6,
    camera: [{ at: 0, preset: "full" }],
    body: [{ at: 0, pose: {} }],
    shots: [{ slice: "new_session" }],
    // Opening a menu keeps the field on screen, so its tap only needs a small
    // lead. Choosing a row closes the menu on the same touch, so those taps lead
    // by most of the ripple: the ripple is seen on the row it belongs to.
    tapLeadsSec: [0.1, 0.4, 0.1, 0.4, 0.1, 0.4, 0.1],
    copy: [
      // The note lands while the session menu is open, and slides back before
      // the form replaces it.
      { kind: "note", at: 0.6, hold: 3.1, title: "Start something new", label: "NEW SESSION" },
    ],
  },

  // -- plan ------------------------------------------------------------------
  //
  // The chat opens empty, in build mode. The phone leans in while the real
  // photo and file pickers add Mia's photo and diary, straightens for the mode
  // chip, then holds while the short prompt is typed. The act module owns the
  // camera push and the body moves; the slice plays at the speed recorded.
  {
    slug: "plan",
    light: "work",
    layout: "L1",
    drift: 1.8,
    camera: [{ at: 0, preset: "full" }],
    body: [
      { at: 0, pose: {} },
      { at: 0.35, pose: { rotateX: -3, rotateY: -4 } },
      { at: 1.35, pose: {} },
    ],
    shots: [{ slice: "plan" }],
    copy: [
      {
        kind: "callout",
        at: 0.4,
        hold: 2.2,
        eyebrow: "ATTACHMENTS",
        title: "Attach images and files, right meow.",
        hint: "Mia’s photo and her diary.",
        side: "left",
        compact: true,
        placement: "edge",
        connector: "t",
        // The first on-camera tap is the Attach photo button.
        anchor: { mode: "firstTap" },
      },
      {
        kind: "callout",
        at: markAt("plan", "attachments_ready") - 0.7,
        hold: 2.6,
        eyebrow: "PLAN",
        title: "Use your agent’s plan mode",
        side: "right",
        anchor: { mode: "point", x: 0.79, y: 0.7375 },
        targetShape: "rounded",
        targetSize: { width: 0.22, height: 0.065 },
      },
    ],
  },

  // -- question --------------------------------------------------------------
  //
  // The phone stands straight and still while the agent works.
  {
    slug: "question",
    light: "work",
    layout: "L1",
    drift: -1,
    camera: [{ at: 0, preset: "full" }],
    body: [{ at: 0, pose: {} }],
    // The plan scene already holds the response and the card, with the chip on
    // PLAN. Hold that last frame for the card beat, then cut to the old question
    // slice for the answer sheet. The sheet covers the composer, so the question
    // scene never shows the chip reset to BUILD after the plan tail blink.
    shots: [
      { slice: "plan", holdAtSec: slice("plan").durationSec - 0.5, holdSec: 2.4 },
      {
        slice: "question",
        from: markAt("question", "answer_sheet_open"),
        // Stop while the selected option holds, before the submit closes the
        // sheet and the resumed turn's replayed answer chunk overlaps the live
        // one in the capture.
        to: markAt("question", "answer_submitted") - 1.0,
      },
    ],
    copy: [
      {
        kind: "callout",
        at: 0.4,
        hold: 2.2,
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
  // The phone holds straight and still while the work happens.
  {
    slug: "build",
    light: "work",
    layout: "L1",
    drift: 1.8,
    camera: [{ at: 0, preset: "full" }],
    body: [{ at: 0, pose: {} }],
    shots: [{ slice: "build" }],
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
  // The pool opens out with the close-up. The script's own framing: the
  // upper-centre preset with scale and focus overridden onto the cost line.
  {
    slug: "usage",
    light: "work",
    layout: "L1",
    drift: -1.6,
    camera: [
      { at: 0, preset: "upper-center", scale: 2.2, focus: { x: 0.5, y: 0.08 } },
    ],
    body: [
      { at: 0, pose: {} },
      { at: CAMERA_EASE_SEC / 2, pose: { rotateY: -4, rotateX: -3 } },
      { at: CAMERA_EASE_SEC, pose: {} },
    ],
    shots: [{ slice: "usage" }],
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
  // The phone stays straight while the diff plays. The empty scope, the branch
  // scope, then the settings.js diff at the full framing the script asks for.
  {
    slug: "changes",
    light: "work",
    layout: "L1",
    drift: 1.7,
    camera: [{ at: 0, preset: "full" }],
    body: [
      { at: 0, pose: {} },
      { at: CAMERA_EASE_SEC / 2, pose: { rotateY: -5 } },
      { at: CAMERA_EASE_SEC, pose: {} },
    ],
    shots: [{ slice: "changes" }],
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
  // The Changes list is back. The phone stands straight, the pool holds, and
  // the haze drifts while the sheet lists main and feat/cat-mode.
  {
    slug: "worktrees",
    light: "work",
    layout: "L1",
    drift: -1.7,
    camera: [{ at: 0, preset: "full" }],
    body: [{ at: 0, pose: {} }],
    shots: [{ slice: "worktrees" }],
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
    shots: [{ slice: "pr" }],
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
// [KR] text, verbatim from the script. Nothing renders these strings. The typing
// on screen is the capture's own keystrokes.

export const KEYBURSTS = {
  plan: "Plan a small cat mode for the cat screensaver.",
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

const sliceByName = (slices: CaptureSlice[]): Map<string, CaptureSlice> =>
  new Map(slices.map((slice) => [slice.name, slice]))

/**
 * Whole frames a recorded slice occupies at 1x.
 * `ceil` keeps the last key inside the shot. The 0.0001 avoids a float
 * landing just over an integer and adding a spare frame.
 */
export const playbackFrames = (durationSec: number): number =>
  Math.max(1, Math.ceil(durationSec * FPS - 1e-4))

export const tapSec = (data: CaptureSlice, which: "first" | "last"): number => {
  const taps = [...(data.taps ?? [])].sort((a, b) => a.atSec - b.atSec)
  const tap = which === "first" ? taps[0] : taps[taps.length - 1]
  if (tap === undefined) {
    throw new Error(`${data.name} has no tap to cut on`)
  }
  return tap.atSec
}

const sourceBound = (
  spec: number | "firstTap" | "lastTap" | undefined,
  fallback: number,
  data: CaptureSlice,
): number => {
  if (spec === undefined) {
    return fallback
  }
  if (spec === "firstTap") {
    return tapSec(data, "first")
  }
  if (spec === "lastTap") {
    return tapSec(data, "last")
  }
  return spec
}

const shotWindow = (
  spec: ShotSpec,
  data: CaptureSlice,
): { startSec: number; spanSec: number; hold: boolean } => {
  if (spec.holdSec !== undefined) {
    return { startSec: spec.holdAtSec ?? 0, spanSec: spec.holdSec, hold: true }
  }
  const startSec = sourceBound(spec.from, 0, data)
  const endSec = sourceBound(spec.to, data.durationSec, data)
  return { startSec, spanSec: Math.max(0, endSec - startSec), hold: false }
}

const sceneFrameCount = (spec: SceneSpec, slices: Map<string, CaptureSlice>): number => {
  const graphic = GRAPHIC_FRAMES[spec.slug]
  if (graphic !== undefined) {
    return graphic
  }
  const frames = spec.shots.reduce((sum, shot) => {
    const data = slices.get(shot.slice)
    if (data === undefined) {
      return sum
    }
    return sum + playbackFrames(shotWindow(shot, data).spanSec)
  }, 0)
  return Math.max(frames, 1)
}

const buildScenes = (slices: CaptureSlice[]): Scene[] => {
  const byName = sliceByName(slices)
  let cursor = 0
  return SCENE_ORDER.map((slug) => {
    const spec = SCENE_SPECS.find((entry) => entry.slug === slug)
    if (spec === undefined) {
      throw new Error(`scene ${slug} has no spec`)
    }
    const frames = sceneFrameCount(spec, byName)
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

const buildShots = (slices: CaptureSlice[], scenes: Scene[]): Shot[] => {
  const byName = sliceByName(slices)
  const shots: Shot[] = []
  for (const spec of SCENE_SPECS) {
    const scene = scenes.find((entry) => entry.slug === spec.slug)
    if (scene === undefined) {
      continue
    }
    const playable = spec.shots.filter((shot) => byName.has(shot.slice))
    let frame = 0
    for (let index = 0; index < playable.length; index += 1) {
      const shotSpec = playable[index]
      const data = byName.get(shotSpec.slice)
      if (data === undefined) {
        continue
      }
      const window = shotWindow(shotSpec, data)
      const span = playbackFrames(window.spanSec)
      const at = scene.from + frame / FPS
      frame += span
      const until = index === playable.length - 1 ? scene.to : scene.from + frame / FPS
      const slot = until - at
      shots.push({
        scene: spec.slug,
        slice: shotSpec.slice,
        at,
        until,
        startSec: window.startSec,
        rate: 1,
        duration: window.hold ? slot : Math.min(window.spanSec, slot),
        hold: window.hold,
        tapLead: spec.tapLeadSec ?? 0,
        tapLeads: spec.tapLeadsSec,
        drift: spec.drift,
        data,
      })
    }
  }
  return shots.sort((a, b) => a.at - b.at)
}

// --- Drift ------------------------------------------------------------------
//
// One continuous sway for the whole film. Peak speed is `DRIFT_PERCENT` of the
// frame width per second. It does not restart on a shot or a scene, because a
// restart moves the phone, the pool, and the beam by different amounts.

export const DRIFT_PERIOD_SEC = 8
export const DRIFT_PERCENT = 1.6

export const driftAt = (sec: number, stageWidth: number): Point => {
  const speed = (DRIFT_PERCENT / 100) * stageWidth
  const amp = (speed * DRIFT_PERIOD_SEC) / (2 * Math.PI)
  return {
    x: Math.sin((sec / DRIFT_PERIOD_SEC) * Math.PI * 2) * amp,
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

export const buildClips = (shots: Shot[]): PhoneClip[] => {
  const clips: PhoneClip[] = []
  for (const shot of shots) {
    if (shot.hold) {
      clips.push({
        kind: "hold",
        file: shot.data.file,
        from: shot.at,
        duration: Math.max(0, shot.until - shot.at),
        atSec: shot.startSec,
      })
      continue
    }
    const playDuration = Math.max(0, Math.min(shot.duration, shot.until - shot.at))
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

/** The one place a source second becomes a render second. Past the end, the last frame holds. */
export const clipFrame = (clip: PhoneClip, sec: number): number => {
  if (clip.kind === "hold") {
    return clip.atSec
  }
  const played = Math.min(clip.duration, Math.max(0, sec - clip.from)) * clip.rate
  return clip.startSec + played
}

export type PhoneLayer = { clip: PhoneClip; opacity: number }

/** The phone picture at `sec`. One layer. Recordings do not share a scroll, so they are not dissolved. */
export const phoneLayers = (clips: PhoneClip[], sec: number): PhoneLayer[] => {
  const clip = clips.find((entry) => sec >= entry.from - 1e-9 && sec < entry.from + entry.duration - 1e-6)
  if (clip === undefined) {
    return []
  }
  return [{ clip, opacity: 1 }]
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

/** The phone fades out as the outro card fades in. */
export const phoneFadeFor = (scenes: Scene[]): Keyframes => {
  const outro = scenes[scenes.length - 1]
  return [
    [outro.from, 1],
    [outro.from + 0.45, 0],
  ]
}

/** The intro slide hands the stage to the phone. */
export const slideFade = 0.4

// --- Camera and body cues ---------------------------------------------------

const buildCameraCues = (scenes: Scene[]): CameraCue[] => {
  const cues: CameraCue[] = []
  for (const spec of SCENE_SPECS) {
    const scene = scenes.find((entry) => entry.slug === spec.slug)
    if (scene === undefined) {
      continue
    }
    let previous = PRESETS.full
    for (const cue of spec.camera) {
      const resolved = resolveCameraCue(cue, previous)
      cues.push({
        at: scene.from + cue.at,
        state: resolved,
        easeSec: cue.easeSec ?? CAMERA_EASE_SEC,
      })
      previous = resolved
    }
  }
  return cues.sort((a, b) => a.at - b.at)
}

const buildBodyCues = (scenes: Scene[]): BodyCue[] => {
  const cues: BodyCue[] = []
  for (const spec of SCENE_SPECS) {
    const scene = scenes.find((entry) => entry.slug === spec.slug)
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

const buildWaddles = (scenes: Scene[]): WaddleCue[] => {
  const cues: WaddleCue[] = []
  for (const spec of SCENE_SPECS) {
    if (spec.waddle === undefined) {
      continue
    }
    const scene = scenes.find((entry) => entry.slug === spec.slug)
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

export const rippleDuration = 0.4
export const rippleColor = "#B6F36B"

/** Source second inside a shot -> render second. The inverse of `clipFrame`. */
const toRenderSec = (shot: Shot, sourceSec: number): number =>
  shot.at + (sourceSec - shot.startSec) / shot.rate

const reachesSource = (shot: Shot, sourceSec: number): boolean =>
  !shot.hold &&
  sourceSec >= shot.startSec - 1e-6 &&
  sourceSec <= shot.startSec + shot.duration * shot.rate + 1e-6

export const buildTaps = (shots: Shot[]): TapEvent[] => {
  const taps: TapEvent[] = []
  const seen = new Set<string>()
  for (const shot of shots) {
    const ordered = [...(shot.data.taps ?? [])].sort((a, b) => a.atSec - b.atSec)
    for (const tap of shot.data.taps ?? []) {
      if (!reachesSource(shot, tap.atSec)) {
        continue
      }
      const id = `${shot.slice}:${tap.atSec.toFixed(4)}`
      if (seen.has(id)) {
        continue
      }
      seen.add(id)
      const index = ordered.findIndex((entry) => entry.atSec === tap.atSec)
      const lead = shot.tapLeads?.[index] ?? shot.tapLead
      taps.push({
        at: toRenderSec(shot, tap.atSec) - lead,
        x: tap.x / shot.data.width,
        y: tap.y / shot.data.height,
        slice: shot.slice,
      })
    }
  }
  return taps.sort((a, b) => a.at - b.at)
}

export const buildKeys = (shots: Shot[]): KeyEvent[] => {
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
// taps — every slice after `connect` — the script's own `targetX`/`targetY`
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

const buildCopy = (shots: Shot[], scenes: Scene[]): CopyItem[] => {
  const items: CopyItem[] = []
  for (const spec of SCENE_SPECS) {
    const scene = scenes.find((entry) => entry.slug === spec.slug)
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
            targetShape: item.targetShape ?? "dot",
            targetSize: item.targetSize ?? null,
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

/**
 * The film's only pop. The achievement opens on the save tap, and the pop
 * lands once that press has read, as the home screen arrives.
 */
export const celebrationAt = (scenes: Scene[]): number => {
  const achievement = scenes.find((scene) => scene.slug === "achievement")
  if (achievement === undefined) {
    throw new Error("the cut has no achievement scene")
  }
  return achievement.from + 0.7
}

const buildCelebrations = (scenes: Scene[]): Celebration[] => [
  { at: celebrationAt(scenes), hold: 1.5, strength: 1, confetti: true, confettiHold: 4.6 },
]

const buildConfetti = (celebrations: Celebration[]): Confetti[] =>
  celebrations
    .filter((celebration) => celebration.confetti)
    .map((celebration) => ({ at: celebration.at, hold: celebration.confettiHold, count: 96 }))

// --- Light ------------------------------------------------------------------

const buildLightCues = (scenes: Scene[]): LightCue[] => {
  const cues: LightCue[] = []
  for (const spec of SCENE_SPECS) {
    const scene = scenes.find((entry) => entry.slug === spec.slug)
    if (scene === undefined) {
      continue
    }
    cues.push({ at: scene.from, state: spec.light })
    for (const extra of spec.lights ?? []) {
      cues.push({ at: scene.from + extra.at, state: extra.state })
    }
  }
  return cues.sort((a, b) => a.at - b.at)
}

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

export const buildSounds = (taps: TapEvent[], keys: KeyEvent[], copy: CopyItem[]): Sound[] => {
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
  idleFrozenAt: (sec: number) => boolean
  phoneFade: Keyframes
  endSec: number
}

/**
 * True once the SSH zoom has filled the frame. The idle walk stops there.
 */
export const idleFrozenAt = (scenes: Scene[], sec: number): boolean => {
  const ssh = scenes.find((scene) => scene.slug === "ssh")
  if (ssh === undefined || sec < ssh.from || sec >= ssh.to) {
    return false
  }
  return openingIdleFrozenAt(sec)
}

/**
 * The whole cut, derived from the captured slices. A missing slice drops its
 * shot. The scene is then as long as the slices that remain. Playback is 1x.
 */
export const buildTimeline = (slices: CaptureSlice[]): Timeline => {
  const scenes = buildScenes(slices)
  const shots = buildShots(slices, scenes)
  const taps = buildTaps(shots)
  const keys = buildKeys(shots)
  const copy = buildCopy(shots, scenes)
  const celebrations = buildCelebrations(scenes)
  const cameras = buildCameraCues(scenes)
  const bodies = buildBodyCues(scenes)
  return {
    scenes,
    shots,
    clips: buildClips(shots),
    taps,
    keys,
    copy,
    ripples: taps.map((tap) => ({ at: tap.at, x: tap.x, y: tap.y })),
    celebrations,
    confetti: buildConfetti(celebrations),
    sounds: buildSounds(taps, keys, copy),
    lights: buildLightCues(scenes),
    cameras,
    bodies,
    waddles: buildWaddles(scenes),
    poseAt: (sec: number) => poseAt(bodies, sec),
    cameraAt: (sec: number) => cameraAt(cameras, sec),
    driftAt: (sec: number, stageWidth: number) => driftAt(sec, stageWidth),
    sceneAt: (sec: number) => sceneAt(scenes, sec),
    idleFrozenAt: (sec: number) => idleFrozenAt(scenes, sec),
    phoneFade: phoneFadeFor(scenes),
    endSec: scenes.length === 0 ? 0 : scenes[scenes.length - 1].to,
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
