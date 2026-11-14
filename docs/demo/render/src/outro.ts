import { REST, type Pose } from "./body"
import {
  CAMERA_EASE_SEC,
  PRESETS,
  cameraAt,
  type CameraCue,
  type CameraState,
} from "./camera"
import { LIGHT_FADE_SEC, lightAt, type LightCue, type LightNow } from "./stage"

// --- The outro act ----------------------------------------------------------
//
// The film's last act. It cuts from the PR on the full handset and settles into
// a graphic-only stage: the wide `full` field dims to the `alone` pool under the
// lockup. No phone is drawn. Times are seconds from the outro cut.

/** The framing the PR hands off: the full handset, centred. */
export const OUTRO_CAMERA: CameraState = PRESETS.full

/**
 * The first cue sits before zero so the card opens on the PR's framing, then
 * the cue at zero holds that same framing. The camera does not move.
 */
const CAMERA_CUES: CameraCue[] = [
  { at: -CAMERA_EASE_SEC, state: OUTRO_CAMERA, easeSec: CAMERA_EASE_SEC },
  { at: 0, state: OUTRO_CAMERA, easeSec: CAMERA_EASE_SEC },
]

export const outroCameraAt = (sec: number): CameraState =>
  cameraAt(CAMERA_CUES, sec)

/**
 * The PR ends on the wide full field. The first cue sits before zero so the
 * card opens on it, then the pool settles into the dim alone pool under the
 * lockup.
 */
const LIGHT_CUES: LightCue[] = [
  { at: -LIGHT_FADE_SEC, state: "full" },
  { at: 0, state: "alone" },
]

export const outroLightAt = (sec: number): LightNow => lightAt(LIGHT_CUES, sec)

/** The phone is gone, so the body holds rest for the whole card. */
export const outroPoseAt = (): Pose => REST
