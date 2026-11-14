import { REST, type Pose } from "./body"
import { PRESETS, type CameraState } from "./camera"
import { LIGHTS, type LightNow } from "./stage"

// --- The question act -------------------------------------------------------
//
// The short act between the plan and the build. The agent has asked its one
// question and the phone holds straight while the question card is answered.
// Plan ends on the full phone in the work pool, and build starts there too, so
// the whole act is one framing, one light, and one straight pose. Times are
// seconds from the question cut, the frame the plan ends.

/** The full handset, centred. Plan hands off here and build starts here. */
export const QUESTION_FRAMING: CameraState = PRESETS.full

/** The phone stands straight while the question is answered. */
export const QUESTION_POSE: Pose = REST

/** The work pool holds for the whole act. */
export const QUESTION_LIGHT: LightNow = { state: "work", shape: LIGHTS.work }

export const questionCameraAt = (): CameraState => QUESTION_FRAMING

export const questionLightAt = (): LightNow => QUESTION_LIGHT

export const questionPoseAt = (): Pose => QUESTION_POSE
