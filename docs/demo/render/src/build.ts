import { REST, type Pose } from "./body"
import { PRESETS, type CameraState } from "./camera"
import { LIGHTS, type LightNow } from "./stage"

// --- The build act ----------------------------------------------------------
//
// The long working act between question and usage. The agent implements the
// plan while the phone holds straight and still. Camera, light, and body are
// constant for the whole act. Times are seconds from the build cut, the frame
// question ends.

/** The whole handset, centred. Question ends here, so the cut does not move. */
export const BUILD_FRAMING: CameraState = PRESETS.full

/** The work pool runs unbroken from question through worktrees. */
export const BUILD_LIGHT: LightNow = { state: "work", shape: LIGHTS.work }

/** The phone watches the build straight, with no lean or idle walk. */
export const BUILD_POSE: Pose = REST

/** The framing holds for the whole act: no second camera move. */
export const buildCameraAt = (): CameraState => BUILD_FRAMING

/** The pool holds for the whole act: question leaves it in `work`. */
export const buildLightAt = (): LightNow => BUILD_LIGHT

export const buildPoseAt = (): Pose => BUILD_POSE
