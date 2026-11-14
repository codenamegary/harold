import { Easing, interpolate } from "remotion"
import { REST, type Pose } from "./body"
import {
  ENTRANCE_SCALE,
  PHONE_FIT,
  VERTICAL_FIT,
  phoneLayout,
  worldView,
  type CameraState,
} from "./camera"
import { LIGHTS, mixShape, shapeToWorld, type LightNow, type WorldView } from "./stage"

// --- The opening act --------------------------------------------------------
//
// Intro lockup, then the SSH walk-on. Every beat of the act is timed here.
// Intro times are seconds from the first frame. SSH times are seconds from the
// SSH cut, which is the frame the phone steps on.

const FPS = 30

/** Whole frames the intro holds before the phone enters. */
export const INTRO_FRAMES = 126

export const INTRO_SEC = INTRO_FRAMES / FPS

/** The lamp comes on. A short flicker, then it holds. */
export const LAMP_ON_SEC = 0.15

/** The mark lands. The words and the CTA follow it. */
export const LOCKUP_IN_SEC = 0.5

/** The lockup starts to leave. */
export const LOCKUP_OUT_SEC = 3.15
export const LOCKUP_FADE_SEC = 0.55

/** The pool starts to slide right and tighten, toward where the phone will stand. */
export const LIGHT_MOVE_SEC = 3.3
export const LIGHT_MOVE_EASE_SEC = 1.3

/** The walk from off stage into the pool, and how many steps it takes. */
export const SSH_WALK_SEC = 1.6
export const SSH_STEPS = 7

/** The little hop on the spot once the walk is done. */
export const SSH_HOP_SEC = 0.34

/** The stage card. It lands as the phone does and leaves as the camera goes in. */
export const SSH_CARD_SEC = 1.2
export const SSH_CARD_HOLD_SEC = 1.7

/** The camera starts to push in. It ends with the phone filling the frame. */
export const SSH_ZOOM_SEC = 2.85
export const SSH_ZOOM_EASE_SEC = 1.05

/** How long the empty home holds before the connect recording starts. */
export const SSH_HOME_HOLD_SEC = 4.1

/** The camera punches onto Add connection as the connect recording starts. */
export const SSH_PUNCH_IN_SEC = SSH_HOME_HOLD_SEC
export const SSH_PUNCH_IN_EASE_SEC = 0.42

/** The camera returns to the full form, just after the Add connection tap. */
export const SSH_PUNCH_OUT_SEC = 5.12
export const SSH_PUNCH_OUT_EASE_SEC = 0.5

export const SSH_PUNCH_SCALE = 2.4
export const SSH_PUNCH_FOCUS_Y = 0.92

const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const
const pushEase = Easing.bezier(0.5, 0, 0.15, 1)
const punchEase = Easing.bezier(0.4, 0, 0.1, 1)
const lightEase = Easing.bezier(0.4, 0, 0.2, 1)
const turnEase = Easing.bezier(0.3, 0, 0.2, 1)

const mix = (from: number, to: number, t: number): number => from + (to - from) * t

// --- Camera -----------------------------------------------------------------

/** Where the phone's feet are on the wide shot, as a fraction of the stage height. */
export const ENTRANCE_FLOOR = 0.8

/** The wide shot stands the phone right of centre, on the side it walked in from. */
export const ENTRANCE_DOCK = 0.62

/** The wide shot. The phone is small, on the floor, and the whole shaft is in frame. */
export const ENTRANCE: CameraState = {
  preset: "full",
  scale: ENTRANCE_SCALE,
  focus: { x: 0.5, y: 1 - (ENTRANCE_FLOOR - 0.5) / (PHONE_FIT * ENTRANCE_SCALE) },
  dock: ENTRANCE_DOCK,
}

/** The phone fills the frame top to bottom, centred. The world is drawn for this framing. */
export const FILLED: CameraState = {
  preset: "full",
  scale: VERTICAL_FIT,
  focus: { x: 0.5, y: 0.5 },
  dock: 0.5,
}

const PUNCHED: CameraState = {
  preset: "lower-center",
  scale: SSH_PUNCH_SCALE,
  focus: { x: 0.5, y: SSH_PUNCH_FOCUS_Y },
  dock: 0.5,
}

// Scale is mixed in log space, so a push covers the same ratio every frame.
const mixCamera = (from: CameraState, to: CameraState, t: number): CameraState => ({
  preset: to.preset,
  scale: Math.exp(mix(Math.log(from.scale), Math.log(to.scale), t)),
  focus: { x: mix(from.focus.x, to.focus.x, t), y: mix(from.focus.y, to.focus.y, t) },
  dock: mix(from.dock, to.dock, t),
})

type CameraMove = {
  start: number
  duration: number
  from: CameraState
  to: CameraState
  easing: (t: number) => number
}

const moveAt = (move: CameraMove, sec: number): CameraState => {
  const t = interpolate(sec, [move.start, move.start + move.duration], [0, 1], {
    ...clamp,
    easing: move.easing,
  })
  return mixCamera(move.from, move.to, t)
}

/**
 * The opening camera. The intro and the walk hold the wide shot. Then the
 * camera pushes in until the phone fills the frame, punches onto Add
 * connection, and returns to the full phone.
 */
export const openingCameraAt = (sec: number): CameraState => {
  const local = sec - INTRO_SEC
  if (local >= SSH_PUNCH_OUT_SEC) {
    return moveAt(
      {
        start: SSH_PUNCH_OUT_SEC,
        duration: SSH_PUNCH_OUT_EASE_SEC,
        from: PUNCHED,
        to: FILLED,
        easing: punchEase,
      },
      local,
    )
  }
  if (local >= SSH_PUNCH_IN_SEC) {
    return moveAt(
      {
        start: SSH_PUNCH_IN_SEC,
        duration: SSH_PUNCH_IN_EASE_SEC,
        from: FILLED,
        to: PUNCHED,
        easing: punchEase,
      },
      local,
    )
  }
  return moveAt(
    {
      start: SSH_ZOOM_SEC,
      duration: SSH_ZOOM_EASE_SEC,
      from: ENTRANCE,
      to: FILLED,
      easing: pushEase,
    },
    local,
  )
}

// --- Light ------------------------------------------------------------------

/** The sizes the opening needs to place the world: the stage and the capture. */
export type StageFrame = {
  stageWidth: number
  stageHeight: number
  videoWidth: number
  videoHeight: number
}

const layoutOf = (camera: CameraState, frame: StageFrame) =>
  phoneLayout(camera, frame.videoWidth, frame.videoHeight, frame.stageWidth, frame.stageHeight, {
    x: 0,
    y: 0,
  })

/** How the wide shot sees the world. */
export const entranceView = (frame: StageFrame): WorldView =>
  worldView(layoutOf(ENTRANCE, frame), layoutOf(FILLED, frame))

/** The lamp's power, 0..1. It catches, dips, and comes up. */
export const lampAt = (sec: number): number =>
  interpolate(
    sec,
    [LAMP_ON_SEC, LAMP_ON_SEC + 0.06, LAMP_ON_SEC + 0.14, LAMP_ON_SEC + 0.22, LAMP_ON_SEC + 0.36, LAMP_ON_SEC + 0.9],
    [0, 0.8, 0.28, 0.95, 0.82, 1],
    clamp,
  )

/**
 * Alone through the intro, in the place the screen names. As the lockup
 * fades, the pool slides right, tightens and brightens into arrival, so it is
 * already waiting where the phone will stand. The shape is in world space:
 * arrival is drawn for the filled frame, and the wide shot sees it from
 * further back.
 */
export const openingLightAt = (sec: number, frame: StageFrame): LightNow => {
  const t = interpolate(sec, [LIGHT_MOVE_SEC, LIGHT_MOVE_SEC + LIGHT_MOVE_EASE_SEC], [0, 1], {
    ...clamp,
    easing: lightEase,
  })
  if (t >= 1) {
    return { state: "arrival", shape: LIGHTS.arrival }
  }
  const alone = shapeToWorld(LIGHTS.alone, entranceView(frame), frame.stageWidth, frame.stageHeight)
  const shape = mixShape(alone, LIGHTS.arrival, t)
  const lamp = lampAt(sec)
  return {
    state: t > 0 ? "arrival" : "alone",
    shape: { ...shape, intensity: shape.intensity * lamp, haze: shape.haze * lamp },
  }
}

// --- Body -------------------------------------------------------------------

/** Where the walk starts: off stage right, further back, facing the way it walks. */
const WALK_FROM = { x: 1060, y: -44, scale: 0.72, rotateY: -22 }

/** The pose the SSH scene holds, and the one the achievement picks up. */
const SETTLED: Pose = REST

const walkProgress = (sec: number): number =>
  Math.min(1, Math.max(0, (sec - INTRO_SEC) / SSH_WALK_SEC))

const hopProgress = (sec: number): number =>
  Math.min(1, Math.max(0, (sec - INTRO_SEC - SSH_WALK_SEC) / SSH_HOP_SEC))

/**
 * Where the phone stands. It comes from further back, so it grows and moves
 * down the floor as it comes, and it turns to face the camera over the last
 * steps. `y` is travel across the floor, never a hop.
 */
export const openingPoseAt = (sec: number): Pose => {
  const t = walkProgress(sec)
  const left = Math.pow(1 - t, 1.6)
  const turn = interpolate(t, [0.45, 1], [0, 1], { ...clamp, easing: turnEase })
  const swell = Math.sin(hopProgress(sec) * Math.PI)
  return {
    x: WALK_FROM.x * left,
    y: WALK_FROM.y * left,
    rotateZ: 0,
    rotateY: mix(WALK_FROM.rotateY, SETTLED.rotateY, turn),
    rotateX: 0,
    scale: mix(1, WALK_FROM.scale, left) * (1 + swell * 0.05),
  }
}

/**
 * The waddle. The phone rocks from corner to corner, and the rock is squared
 * off so it snaps over instead of swaying. Each rock lifts it, the way
 * tipping onto a corner would. The steps shrink as it arrives. Then one hop
 * on the spot. Additive, so it rides on `openingPoseAt` and ends clean.
 */
export const openingWaddleAt = (sec: number): Pose => {
  const local = sec - INTRO_SEC
  if (local <= 0 || local >= SSH_WALK_SEC + SSH_HOP_SEC) {
    return REST
  }
  if (local >= SSH_WALK_SEC) {
    const hop = Math.sin(hopProgress(sec) * Math.PI)
    return { ...REST, y: -24 * hop, rotateX: -5 * hop }
  }
  const t = local / SSH_WALK_SEC
  const swing = Math.sin(t * SSH_STEPS * Math.PI)
  const rock = Math.sign(swing) * Math.sqrt(Math.abs(swing))
  const size = Math.min(1, (1 - t) / 0.22)
  return {
    ...REST,
    y: -Math.abs(rock) * 22 * size,
    rotateZ: rock * 11 * size,
    rotateX: -4 * size,
  }
}

/** How much of the idle walk the phone keeps while it waits for the camera. */
export const SSH_IDLE_GAIN = 0.5

/**
 * The idle walk comes up once the phone has landed and is gone before the
 * push-in ends. It eases both ways, so the phone never snaps still.
 */
export const openingIdleGainAt = (sec: number): number => {
  const local = sec - INTRO_SEC
  const landed = SSH_WALK_SEC + SSH_HOP_SEC
  const rise = interpolate(local, [landed, landed + 0.5], [0, SSH_IDLE_GAIN], clamp)
  const fall = interpolate(local, [SSH_ZOOM_SEC - 0.15, SSH_ZOOM_SEC + 0.4], [1, 0], clamp)
  return rise * fall
}

/** True once the SSH zoom has filled the frame. The idle walk stops there. */
export const openingIdleFrozenAt = (sec: number): boolean => {
  if (sec < INTRO_SEC) {
    return false
  }
  return openingCameraAt(sec).scale >= VERTICAL_FIT - 0.01
}
