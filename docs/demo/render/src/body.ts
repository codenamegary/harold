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
  /** Nod, degrees. Negative tips the top toward the camera (leans in). Positive tips it away (sits back). */
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

/** Gaps at least this long are a hold, then a short ease. Shorter gaps play straight through. */
const AUTHORED_GAP_SEC = 1.6

/** How long a held pose takes to become the next one. */
export const POSE_EASE_SEC = 0.6

const easeWindow = (gap: number): number =>
  gap <= AUTHORED_GAP_SEC ? gap : Math.min(POSE_EASE_SEC, gap)

/**
 * The pose at `sec`. Close cues (the waddle steps, a lean-in) ease across the
 * whole gap. A long gap holds the pose it already reached, then eases in the
 * last `POSE_EASE_SEC`. A scene's body language stays put until the next cue.
 */
export const poseAt = (cues: BodyCue[], sec: number): Pose => {
  if (cues.length === 0) {
    return REST
  }
  const nextIndex = cues.findIndex((cue) => cue.at >= sec)
  if (nextIndex <= 0) {
    return cues[nextIndex === 0 ? 0 : cues.length - 1].pose
  }
  const next = cues[nextIndex]
  const prev = cues[nextIndex - 1]
  const window = easeWindow(next.at - prev.at)
  if (window <= 0) {
    return next.pose
  }
  const start = next.at - window
  if (sec <= start) {
    return prev.pose
  }
  const t = (sec - start) / window
  return mixPose(prev.pose, next.pose, ease(t))
}

/**
 * The pose at `sec`, with an exit cue at the end of the act. `poseAt` holds the
 * last authored pose, then eases to `next` over the final `POSE_EASE_SEC`, so
 * the cut hands the next act a settled pose instead of a snap.
 */
export const poseAtCut = (
  cues: BodyCue[],
  sec: number,
  durationSec: number,
  next: Pose,
): Pose => poseAt([...cues, { at: durationSec, pose: next }], sec)

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
  const damp = 1 - t
  return {
    x: 0,
    y: -Math.abs(Math.sin(t * Math.PI * 8)) * 36 * damp,
    rotateZ: Math.sin(t * Math.PI * 8) * 12 * damp,
    rotateY: Math.sin(t * Math.PI * 4 + 0.4) * 10 * damp,
    rotateX: Math.sin(t * Math.PI * 4) * 5 * damp,
    scale: 1,
  }
}

/** A slow idle sway, so a held pose is never a still image. */
export const swayAt = (sec: number, amplitude: number, period = 7): number =>
  Math.sin((sec / period) * Math.PI * 2) * amplitude

/**
 * The waddle, kept quiet, so a held pose uses the same walk instead of freezing.
 * Additive, and much smaller than the entrance.
 */
export const idleAt = (sec: number): Pose => ({
  x: swayAt(sec, 6, 2.4),
  y: -Math.abs(swayAt(sec, 14, 1.2)),
  rotateZ: swayAt(sec, 5, 1.2),
  rotateY: swayAt(sec, 2.6, 2.4),
  rotateX: swayAt(sec, 1.6, 2.4),
  scale: 1,
})

/**
 * Close-ups quiet the idle so a form or a diff stays readable.
 * The gain eases between 1x and the vertical fit, so a zoom does not pop the sway.
 */
export const idleGainForScale = (scale: number): number => {
  if (scale <= 1) {
    return 1
  }
  if (scale >= 1.18) {
    return 0.28
  }
  return 1 + ((0.28 - 1) * (scale - 1)) / 0.18
}

export const scalePose = (pose: Pose, gain: number): Pose => ({
  x: pose.x * gain,
  y: pose.y * gain,
  rotateZ: pose.rotateZ * gain,
  rotateY: pose.rotateY * gain,
  rotateX: pose.rotateX * gain,
  scale: 1 + (pose.scale - 1) * gain,
})

export const addPose = (base: Pose, extra: Pose): Pose => ({
  x: base.x + extra.x,
  y: base.y + extra.y,
  rotateZ: base.rotateZ + extra.rotateZ,
  rotateY: base.rotateY + extra.rotateY,
  rotateX: base.rotateX + extra.rotateX,
  scale: base.scale * extra.scale,
})
