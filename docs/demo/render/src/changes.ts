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
import { LIGHTS, mixShape, type LightNow } from "./stage"

// --- The changes act --------------------------------------------------------
//
// The phone stays straight while the diff plays. The act opens on the usage
// close-up and pulls back to the full phone, then holds. Times are seconds from
// the changes cut, the frame usage ends.

/** The framing usage hands off: the header close-up at 2.2x. */
export const CHANGES_HANDOFF: CameraState = {
  ...PRESETS["upper-center"],
  scale: 2.2,
  focus: { x: 0.5, y: 0.08 },
}

/** The full handset, centred. The work scenes start here. */
export const CHANGES_WIDE: CameraState = PRESETS.full

/**
 * The first cue sits before zero so the act opens on the usage framing. The cue
 * at zero then pulls back to the full phone.
 */
const CAMERA_CUES: CameraCue[] = [
  { at: -CAMERA_EASE_SEC, state: CHANGES_HANDOFF, easeSec: CAMERA_EASE_SEC },
  { at: 0, state: CHANGES_WIDE, easeSec: CAMERA_EASE_SEC },
]

export const changesCameraAt = (sec: number): CameraState =>
  sec <= 0 ? CHANGES_HANDOFF : cameraAt(CAMERA_CUES, sec)

/** The close-up flood the usage act ends on. */
export const CHANGES_HANDOFF_LIGHT: LightNow = {
  state: "work",
  shape: NEW_SESSION_WIDE_LIGHT,
}

/** The work pool the act settles into. */
export const CHANGES_LIGHT: LightNow = { state: "work", shape: LIGHTS.work }

const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const
const lightEase = Easing.bezier(0.4, 0, 0.2, 1)

/** The flood pulls back into the work pool as the camera pulls back. */
export const changesLightAt = (sec: number): LightNow => {
  if (sec <= 0) {
    return CHANGES_HANDOFF_LIGHT
  }
  if (sec >= CAMERA_EASE_SEC) {
    return CHANGES_LIGHT
  }
  const t = interpolate(sec, [0, CAMERA_EASE_SEC], [0, 1], {
    ...clamp,
    easing: lightEase,
  })
  return { state: "work", shape: mixShape(NEW_SESSION_WIDE_LIGHT, LIGHTS.work, t) }
}

/**
 * The phone turns a little while the camera pulls back, then straightens
 * before the diff holds. Rotation belongs to the move, not to the demo.
 */
export const CHANGES_TRANSITION_POSE: Pose = {
  ...REST,
  rotateY: -5,
}

const POSE_CUES: BodyCue[] = [
  { at: 0, pose: REST },
  { at: CAMERA_EASE_SEC / 2, pose: CHANGES_TRANSITION_POSE },
  { at: CAMERA_EASE_SEC, pose: REST },
]

/** The handset is straight at both ends of the pull-back and holds straight. */
export const changesPoseAt = (sec: number): Pose => poseAt(POSE_CUES, sec)
