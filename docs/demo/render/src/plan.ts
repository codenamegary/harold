import { Easing, interpolate } from "remotion"
import { REST, poseAt, type BodyCue, type Pose } from "./body"
import {
  CAMERA_EASE_SEC,
  PRESETS,
  VERTICAL_FIT,
  cameraAt,
  type CameraCue,
  type CameraState,
} from "./camera"
import { markAt } from "./capture"
import { NEW_SESSION_REST_LIGHT } from "./newSession"
import { LIGHTS, LIGHT_FADE_SEC, mixShape, type LightNow } from "./stage"

// --- The plan act -----------------------------------------------------------
//
// The first working act. It opens on the new-session resting pool and the full
// phone, then pushes in while the attachments are added. The phone leans into
// the light for the attach beat and straightens for the mode chip and the short
// prompt. The camera pulls back to the full handset as the prompt is sent, so
// the act still hands the question a full, straight phone. Times are seconds
// from the plan cut, the frame new-session ends.

/** The full handset, centred. New-session ends here and the question starts here. */
export const PLAN_CAMERA: CameraState = PRESETS.full

/** The attachment close-up: the whole app screen, one stage height. */
export const PLAN_CLOSE: CameraState = {
  ...PRESETS.full,
  scale: VERTICAL_FIT,
}

/**
 * The push starts after the new-session handoff has read, then holds through
 * the pickers, the mode chip and the typing. The pull starts just before the
 * send tap, so it lands inside the slice's post-send hold.
 */
export const PLAN_PUSH_SEC = 0.3
export const PLAN_SEND_SEC = markAt("plan", "plan_sent")
export const PLAN_PULL_SEC = Math.max(PLAN_PUSH_SEC + CAMERA_EASE_SEC, PLAN_SEND_SEC - 0.1)

const CAMERA_CUES: CameraCue[] = [
  { at: -CAMERA_EASE_SEC, state: PLAN_CAMERA, easeSec: CAMERA_EASE_SEC },
  { at: PLAN_PUSH_SEC, state: PLAN_CLOSE, easeSec: CAMERA_EASE_SEC },
  { at: PLAN_PULL_SEC, state: PLAN_CAMERA, easeSec: CAMERA_EASE_SEC },
]

export const planCameraAt = (sec: number): CameraState =>
  sec <= 0 ? PLAN_CAMERA : cameraAt(CAMERA_CUES, sec)

/** The body cues the timeline mirrors. The lean belongs to the attach beat. */
export const PLAN_POSE_CUES: readonly BodyCue[] = [
  { at: 0, pose: REST },
  { at: 0.35, pose: { ...REST, rotateX: -3, rotateY: -4 } },
  { at: 1.35, pose: REST },
]

/** The handset is straight at both ends and for the mode tap and typing. */
export const planPoseAt = (sec: number): Pose => poseAt([...PLAN_POSE_CUES], sec)

const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const
const lightEase = Easing.bezier(0.4, 0, 0.2, 1)

/**
 * The light at `sec`. New-session's resting pool narrows into the working pool
 * over the first second or so. Both ends are exact shapes, so the handoff
 * neither snaps nor drifts.
 */
export const planLightAt = (sec: number): LightNow => {
  if (sec <= 0) {
    return { state: "work", shape: NEW_SESSION_REST_LIGHT }
  }
  if (sec >= LIGHT_FADE_SEC) {
    return { state: "work", shape: LIGHTS.work }
  }
  const t = interpolate(sec, [0, LIGHT_FADE_SEC], [0, 1], {
    ...clamp,
    easing: lightEase,
  })
  return { state: "work", shape: mixShape(NEW_SESSION_REST_LIGHT, LIGHTS.work, t) }
}
