import { Easing, interpolate } from "remotion"
import { REST, poseAt, type BodyCue, type Pose } from "./body"
import {
  CAMERA_EASE_SEC,
  PRESETS,
  cameraAt,
  type CameraCue,
  type CameraState,
} from "./camera"
import { NEW_SESSION_WIDE_LIGHT } from "./newSession"
import { LIGHTS, mixShape, type LightNow, type LightShape } from "./stage"

// --- The usage act ----------------------------------------------------------
//
// The short close-up on the context and cost line. It opens on the full handset
// the build leaves behind, then pushes in on the header and holds there while
// the numbers read. The phone stays straight; the camera does the move. Times
// are seconds from the usage cut, the frame the build ends.

/** The framing the build hands off: the full handset, centred. */
export const USAGE_HANDOFF: CameraState = PRESETS.full

/**
 * The script's own framing, override and all: 2.2x on the cost line at the top
 * of the app screen. The phone fills the frame, so the camera never shows stage
 * through it.
 */
export const USAGE_FRAMING: CameraState = {
  preset: "upper-center",
  scale: 2.2,
  focus: { x: 0.5, y: 0.08 },
  dock: 0.5,
}

/**
 * The first cue sits before zero so the act opens on the build's framing. The
 * cue at zero then eases into the header close-up.
 */
const CAMERA_CUES: CameraCue[] = [
  { at: -CAMERA_EASE_SEC, state: USAGE_HANDOFF, easeSec: CAMERA_EASE_SEC },
  { at: 0, state: USAGE_FRAMING, easeSec: CAMERA_EASE_SEC },
]

export const usageCameraAt = (sec: number): CameraState =>
  sec <= 0 ? USAGE_HANDOFF : cameraAt(CAMERA_CUES, sec)

/** The work pool the build ends on. */
export const USAGE_HANDOFF_LIGHT: LightNow = { state: "work", shape: LIGHTS.work }

/**
 * The close-up flood. At 2.2x the handset's feet are below the frame, so a pool
 * on the floor cannot sit under them. The light opens out like the new-session
 * push-in instead and fills the stage around the phone.
 */
export const USAGE_WIDE_LIGHT: LightShape = NEW_SESSION_WIDE_LIGHT

const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const
const lightEase = Easing.bezier(0.4, 0, 0.2, 1)

/** The pool opens out with the camera push-in, then floods the close-up. */
export const usageLightAt = (sec: number): LightNow => {
  if (sec <= 0) {
    return USAGE_HANDOFF_LIGHT
  }
  if (sec >= CAMERA_EASE_SEC) {
    return { state: "work", shape: USAGE_WIDE_LIGHT }
  }
  const t = interpolate(sec, [0, CAMERA_EASE_SEC], [0, 1], {
    ...clamp,
    easing: lightEase,
  })
  return { state: "work", shape: mixShape(USAGE_HANDOFF_LIGHT.shape, USAGE_WIDE_LIGHT, t) }
}

/**
 * The phone leans in a little while the camera pushes in, then straightens
 * before the hold. Rotation belongs to the move, not to the demo.
 */
export const USAGE_TRANSITION_POSE: Pose = {
  ...REST,
  rotateY: -4,
  rotateX: -3,
}

const POSE_CUES: BodyCue[] = [
  { at: 0, pose: REST },
  { at: CAMERA_EASE_SEC / 2, pose: USAGE_TRANSITION_POSE },
  { at: CAMERA_EASE_SEC, pose: REST },
]

/** The handset is straight at both ends of the push-in and holds straight. */
export const usagePoseAt = (sec: number): Pose => poseAt(POSE_CUES, sec)
