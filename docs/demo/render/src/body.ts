import { Easing } from "remotion"

// --- The phone as a character ----------------------------------------------
//
// The phone has to earn the light. It is small and off centre while it is unsure
// of itself, it leans in when it is working, and it turns to present its screen
// when it has something to show. The SSH scene enters with a waddle; that body
// language is reused for the rest of the film rather than played once.
//
// Every pose is data. `poseAt` eases between cues and holds the last one, and
// `waddleAt` is the additive entrance wobble.

const ease = Easing.bezier(0.33, 0, 0.15, 1)

export type Pose = {
  /** Stage px offset. */
  x: number
  y: number
  /** Roll, degrees. */
  rotateZ: number
  /** Turn towards or away from the camera, degrees. Positive turns away. */
  rotateY: number
  /** Nod towards or away from the camera, degrees. Positive leans in. */
  rotateX: number
  scale: number
}

export const REST: Pose = { x: 0, y: 0, rotateZ: 0, rotateY: 0, rotateX: 0, scale: 1 }

export type BodyCueSpec = { at: number; pose: Partial<Pose> }

export type BodyCue = { at: number; pose: Pose }

const withPose = (base: Pose, patch: Partial<Pose>): Pose => ({ ...base, ...patch })

/**
 * Every cue is authored as a partial pose applied to rest, never to the previous
 * cue, so a cue means the same thing wherever it is read.
 */
export const resolveBodyCue = (spec: BodyCueSpec): BodyCue => ({
  at: spec.at,
  pose: withPose(REST, spec.pose),
})

const mixPose = (from: Pose, to: Pose, t: number): Pose => ({
  x: from.x + (to.x - from.x) * t,
  y: from.y + (to.y - from.y) * t,
  rotateZ: from.rotateZ + (to.rotateZ - from.rotateZ) * t,
  rotateY: from.rotateY + (to.rotateY - from.rotateY) * t,
  rotateX: from.rotateX + (to.rotateX - from.rotateX) * t,
  scale: from.scale + (to.scale - from.scale) * t,
})

export const poseAt = (cues: BodyCue[], sec: number): Pose => {
  if (cues.length === 0) {
    return REST
  }
  if (sec <= cues[0].at) {
    return cues[0].pose
  }
  for (let index = 1; index < cues.length; index += 1) {
    const to = cues[index]
    if (sec <= to.at) {
      const from = cues[index - 1]
      const span = to.at - from.at
      const t = span <= 0 ? 1 : (sec - from.at) / span
      return mixPose(from.pose, to.pose, ease(t))
    }
  }
  return cues[cues.length - 1].pose
}

export type Waddle = { at: number; duration: number }

/**
 * The entrance. A wobble that rings down, plus a bob, plus a turn that settles.
 * Additive, so it can ride on top of a held pose and still stop cleanly.
 */
export const waddleAt = (waddle: Waddle, sec: number): Pose => {
  const t = (sec - waddle.at) / waddle.duration
  if (t <= 0 || t >= 1) {
    return REST
  }
  const damp = (1 - t) * (1 - t)
  return {
    x: 0,
    y: -Math.abs(Math.sin(t * Math.PI * 6)) * 16 * damp,
    rotateZ: Math.sin(t * Math.PI * 6) * 4.5 * damp,
    rotateY: Math.sin(t * Math.PI * 3 + 0.4) * 9 * damp,
    rotateX: Math.sin(t * Math.PI * 3) * 2.5 * damp,
    scale: 1,
  }
}

/** A slow idle sway, so a held pose is never a still image. */
export const swayAt = (sec: number, amplitude: number, period = 7): number =>
  Math.sin((sec / period) * Math.PI * 2) * amplitude

export const addPose = (base: Pose, extra: Pose): Pose => ({
  x: base.x + extra.x,
  y: base.y + extra.y,
  rotateZ: base.rotateZ + extra.rotateZ,
  rotateY: base.rotateY + extra.rotateY,
  rotateX: base.rotateX + extra.rotateX,
  scale: base.scale * extra.scale,
})
