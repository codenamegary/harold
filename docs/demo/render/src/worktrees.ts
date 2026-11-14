import { REST, type Pose } from "./body"
import { PRESETS, type CameraState } from "./camera"
import { LIGHTS, type LightNow } from "./stage"

// --- The worktrees act -------------------------------------------------------
//
// The Changes list is back. The phone stands straight and still, the pool holds,
// and the haze drifts while the sheet lists main and feat/cat-mode. Nothing
// moves but the camera's global drift, which the phone does not take. Times are
// seconds from the worktrees cut, the frame the changes act ends.

/** The full handset, centred. Changes ends here and worktrees holds it. */
export const WORKTREES_FRAMING: CameraState = PRESETS.full

/** The phone holds the resting pose for the whole act. */
export const WORKTREES_POSE: Pose = REST

/**
 * The camera framing. The cut comes from changes at full, so there is nothing
 * to ease to, and the framing stays full for the whole act.
 */
export const worktreesCameraAt = (): CameraState => WORKTREES_FRAMING

/** The working pool, unchanged from the changes act. */
export const WORKTREES_LIGHT: LightNow = { state: "work", shape: LIGHTS.work }

export const worktreesLightAt = (): LightNow => WORKTREES_LIGHT

export const worktreesPoseAt = (): Pose => WORKTREES_POSE
