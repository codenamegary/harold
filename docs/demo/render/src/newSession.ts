import { Easing, interpolate } from "remotion"
import { REST, idleGainForScale, type Pose } from "./body"
import {
  CAMERA_EASE_SEC,
  PRESETS,
  cameraAt,
  type CameraCue,
  type CameraState,
} from "./camera"
import {
  LIGHTS,
  LIGHT_FADE_SEC,
  mixShape,
  type LightNow,
  type LightShape,
} from "./stage"

// --- The new-session act ----------------------------------------------------
//
// The short act between the achievement and the working cut. It opens on the
// achievement's two-column framing, returns to centre, pushes in on the session
// form, then pulls back to the full phone as the chat opens. Between those moves
// the phone holds still. The pool widens with the push-in and lands with the
// full phone standing in a wide, forward resting pool. Times are seconds from
// the new-session cut, the frame the achievement ends.

/** The framing the achievement hands off: docked right at 2x. */
export const NEW_SESSION_HANDOFF: CameraState = {
  preset: "center-two-thirds",
  scale: 2,
  focus: { x: 0.5, y: 0.5 },
  dock: 0.66,
}

/** The full handset, centred. The work scenes start here. */
export const NEW_SESSION_WIDE: CameraState = PRESETS.full

/** The form close-up. */
export const NEW_SESSION_FORM: CameraState = {
  ...PRESETS["center-two-thirds"],
  // At 2x the handset is taller than the frame. Anchor the top of the app
  // screen to the top edge so the session menu stays in shot.
  focus: { x: 0.5, y: 0.3049 },
}

/** The act settles back to the full phone by this time. */
export const NEW_SESSION_SETTLE_SEC = 0.6

/** The camera reaches centre, then pushes in on the form. */
export const NEW_SESSION_PUSH_SEC = 1.9

/** The chat opening pulls the camera back to the full phone. */
export const NEW_SESSION_BACK_SEC = 3.6

/**
 * The first cue sits before zero so the act opens on the achievement's
 * framing. The cue at zero then eases back to the full phone.
 */
const CAMERA_CUES: CameraCue[] = [
  { at: -CAMERA_EASE_SEC, state: NEW_SESSION_HANDOFF, easeSec: CAMERA_EASE_SEC },
  { at: 0, state: NEW_SESSION_WIDE, easeSec: NEW_SESSION_SETTLE_SEC },
  { at: NEW_SESSION_PUSH_SEC, state: NEW_SESSION_FORM, easeSec: CAMERA_EASE_SEC },
  { at: NEW_SESSION_BACK_SEC, state: NEW_SESSION_WIDE, easeSec: CAMERA_EASE_SEC },
]

export const newSessionCameraAt = (sec: number): CameraState =>
  sec <= 0 ? NEW_SESSION_HANDOFF : cameraAt(CAMERA_CUES, sec)

/** The pool widens again with the push-in and moves forward, off the bottom edge. */
export const NEW_SESSION_WIDE_LIGHT: LightShape = {
  ...LIGHTS.work,
  radiusX: 1.035,
  radiusY: 0.13,
  centreY: 0.96,
}

/** The pull-back lands on a wide, forward pool that still holds the phone's feet. */
export const NEW_SESSION_REST_LIGHT: LightShape = {
  ...LIGHTS.work,
  radiusX: 0.384,
  radiusY: 0.144,
  centreY: 0.95,
}

const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const
const lightEase = Easing.bezier(0.4, 0, 0.2, 1)

/** The achievement's reward pool fades into the new-session pool on the cut. */
const handoffLightAt = (sec: number): LightNow => {
  const t = interpolate(sec, [0, LIGHT_FADE_SEC], [0, 1], {
    ...clamp,
    easing: lightEase,
  })
  if (t >= 1) {
    return { state: "work", shape: NEW_SESSION_REST_LIGHT }
  }
  return { state: "work", shape: mixShape(LIGHTS.reward, NEW_SESSION_REST_LIGHT, t) }
}

/** The light that follows the camera: wide with the push-in, then back to rest. */
export const newSessionLightAt = (sec: number): LightNow => {
  const handoff = handoffLightAt(sec)
  const wideAt = NEW_SESSION_PUSH_SEC + CAMERA_EASE_SEC
  if (sec < NEW_SESSION_PUSH_SEC) {
    return handoff
  }
  if (sec < wideAt) {
    const t = interpolate(sec, [NEW_SESSION_PUSH_SEC, wideAt], [0, 1], {
      ...clamp,
      easing: lightEase,
    })
    return { state: "work", shape: mixShape(handoff.shape, NEW_SESSION_WIDE_LIGHT, t) }
  }
  if (sec < NEW_SESSION_BACK_SEC) {
    return { state: "work", shape: NEW_SESSION_WIDE_LIGHT }
  }
  const restAt = NEW_SESSION_BACK_SEC + CAMERA_EASE_SEC
  if (sec < restAt) {
    const t = interpolate(sec, [NEW_SESSION_BACK_SEC, restAt], [0, 1], {
      ...clamp,
      easing: lightEase,
    })
    return { state: "work", shape: mixShape(NEW_SESSION_WIDE_LIGHT, NEW_SESSION_REST_LIGHT, t) }
  }
  return { state: "work", shape: NEW_SESSION_REST_LIGHT }
}

/** The phone returns to centre and holds for the whole act. */
export const newSessionPoseAt = (): Pose => REST

/** The idle sway eases out over the handoff, then stays off. */
export const NEW_SESSION_IDLE_FADE_SEC = 0.35

/**
 * How much of the quiet idle walk the phone keeps at `sec`. The act opens on the
 * achievement's idle gain, fades it out over the first third of a second, then
 * holds the handset still. Only the camera moves the phone after that.
 */
export const newSessionIdleGainAt = (sec: number, cameraScale: number): number =>
  sec >= NEW_SESSION_IDLE_FADE_SEC
    ? 0
    : idleGainForScale(cameraScale) * (1 - sec / NEW_SESSION_IDLE_FADE_SEC)
