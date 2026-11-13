import { Easing, interpolate } from "remotion"
import { REST, type Pose } from "./body"
import { PRESETS, type CameraState } from "./camera"
import { NEW_SESSION_REST_LIGHT } from "./newSession"
import { LIGHTS, LIGHT_FADE_SEC, mixShape, type LightNow } from "./stage"

// --- The plan act -----------------------------------------------------------
//
// The first working act. It opens on the new-session resting pool and the full
// phone, then the light narrows into the working pool. The phone stays straight
// and still for the whole demo. Times are seconds from the plan cut, the frame
// new-session ends.

/** The full handset, centred. New-session ends here and every work scene holds it. */
export const PLAN_CAMERA: CameraState = PRESETS.full

/**
 * The camera does not move during the act, and new-session hands it the same
 * framing, so there is no handoff move to ease through.
 */
export const planCameraAt = (): CameraState => PLAN_CAMERA

/** No lean, turn, or idle walk while the prompt is being typed. */
export const planPoseAt = (): Pose => REST

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
