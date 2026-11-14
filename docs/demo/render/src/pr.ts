import { REST, type Pose } from "./body"
import { PRESETS, type CameraState } from "./camera"
import { LIGHTS, LIGHT_FADE_SEC, lightAt, type LightCue, type LightNow } from "./stage"

// --- The PR act -------------------------------------------------------------
//
// The last working act. The phone has finished its work and sits at rest while
// the pool opens from the work light into the wider full field, giving the
// closing spotlight room around the handset. The camera does not move from the
// full phone. Times are seconds from the pr cut, the frame worktrees ends.

/** The full handset, centred. Worktrees hands this off and the outro takes it. */
export const PR_FRAMING: CameraState = PRESETS.full

/** The framing holds for the whole act. */
export const prCameraAt = (): CameraState => PR_FRAMING

/** The light worktrees hands off. */
export const PR_HANDOFF_LIGHT: LightNow = { state: "work", shape: LIGHTS.work }

/** The working cut closes on `work`; the film's last field opens on `full`. */
const LIGHT_CUES: LightCue[] = [
  { at: -LIGHT_FADE_SEC, state: "work" },
  { at: 0, state: "full" },
]

/** The light eases from `work` into `full` across the cut, then holds. */
export const prLightAt = (sec: number): LightNow => lightAt(LIGHT_CUES, sec)

/** The phone has finished working and sits at rest for the whole act. */
export const prPoseAt = (): Pose => REST
