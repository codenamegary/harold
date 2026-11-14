import { REST, poseAt, type Pose } from "./body"
import {
  CAMERA_EASE_SEC,
  VERTICAL_FIT,
  cameraAt,
  type CameraCue,
  type CameraState,
} from "./camera"
import { LIGHT_FADE_SEC, lightAt, type LightCue, type LightNow } from "./stage"

// --- The achievement act ----------------------------------------------------
//
// The short act between the SSH setup and the working cut. It opens on the Save
// tap, the pool blooms, the camera eases into the right slot, and the phone
// leans in when the home screen lands. Times are seconds from the achievement
// cut, the frame the save tap lands.

/** The framing the opening hands off: filled, centred, no turn. */
export const ACHIEVEMENT_HANDOFF: CameraState = {
  preset: "full",
  scale: VERTICAL_FIT,
  focus: { x: 0.5, y: 0.5 },
  dock: 0.5,
}

/** The two-column framing, docked clear of the left spotlight. */
export const ACHIEVEMENT_FRAMING: CameraState = {
  preset: "center-two-thirds",
  scale: 2,
  focus: { x: 0.5, y: 0.5 },
  dock: 0.66,
}

/**
 * The first cue sits before zero so the first rendered frame is the handoff,
 * not the target. `cameraAt` then eases into the achievement framing.
 */
const CAMERA_CUES: CameraCue[] = [
  { at: -CAMERA_EASE_SEC, state: ACHIEVEMENT_HANDOFF, easeSec: CAMERA_EASE_SEC },
  { at: 0, state: ACHIEVEMENT_FRAMING, easeSec: CAMERA_EASE_SEC },
]

export const achievementCameraAt = (sec: number): CameraState =>
  sec <= 0 ? ACHIEVEMENT_HANDOFF : cameraAt(CAMERA_CUES, sec)

/** The pool is still on arrival at the cut, then blooms into the reward state. */
const LIGHT_CUES: LightCue[] = [
  { at: -LIGHT_FADE_SEC, state: "arrival" },
  { at: 0, state: "reward" },
]

export const achievementLightAt = (sec: number): LightNow => lightAt(LIGHT_CUES, sec)

/** The lean begins as the home screen arrives. */
export const ACHIEVEMENT_LEAN_SEC = 0.85

/** The phone leans in and tips its top towards the camera. */
export const ACHIEVEMENT_LEAN: Pose = {
  ...REST,
  rotateX: -4,
  rotateZ: 3,
  y: -6,
}

/**
 * The body at `sec` from the cut. `durationSec` is the scene's own length, so
 * the phone eases back to rest over the last pose window and the working cut
 * starts from a settled handset.
 */
export const achievementPoseAt = (sec: number, durationSec: number): Pose =>
  poseAt(
    [
      { at: 0, pose: REST },
      { at: ACHIEVEMENT_LEAN_SEC, pose: ACHIEVEMENT_LEAN },
      { at: durationSec, pose: REST },
    ],
    sec,
  )
