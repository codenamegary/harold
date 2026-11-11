import { Easing } from "remotion"

// --- The stage --------------------------------------------------------------
//
// One dark stage for the whole film. A single floodlight pool is the only light.
// Nothing else is lit: the wall and floor are the darkest layer, the pool is the
// ellipse where the floor meets the wall, the phone stands between the pool and
// the haze, and the haze is the nearest layer.
//
// The light carries the arc, so it changes at act boundaries and then holds.
// `lightAt` is the only place a light state becomes pixels.

const ease = Easing.bezier(0.4, 0, 0.2, 1)

export type LightState = "alone" | "arrival" | "reward" | "work" | "full"

export const LIGHT_STATES: readonly LightState[] = ["alone", "arrival", "reward", "work", "full"]

export type LightShape = {
  /** Pool half-width, as a fraction of the stage width. */
  radiusX: number
  /** Pool half-height, as a fraction of the stage height. */
  radiusY: number
  centreX: number
  centreY: number
  /** Pool brightness, 0..1. */
  intensity: number
  /** Foreground shaft and dust, 0..1. */
  haze: number
  /** Bloom ring around the pool, 0..1. */
  flare: number
}

// The five states are not five shades of dark: each one changes the *shape* of
// the pool as well as its brightness, so the cut between them is visible on a
// single frame. `alone` is a smudge, `reward` is the whole room lit, `work` is a
// shaft narrow enough to see the phone's shadow on the floor.
//
// The pool sits *low* on the floor, where the phone's feet are, and never dead
// centred behind it: an ellipse centred on the phone reads as a halo, an ellipse
// the phone stands at the edge of reads as a light the phone has stepped into.
export const LIGHTS: Record<LightState, LightShape> = {
  // A wide, weak spill low on the floor: the slide catches only its edge.
  alone: { radiusX: 0.36, radiusY: 0.11, centreX: 0.52, centreY: 0.8, intensity: 0.14, haze: 0.05, flare: 0 },
  // Bright and tight, low on the floor, with the phone standing in its edge.
  arrival: { radiusX: 0.28, radiusY: 0.15, centreX: 0.44, centreY: 0.78, intensity: 0.46, haze: 0.14, flare: 0.12 },
  // The room opens up: the pool blooms across the floor and up the wall behind
  // the phone, and the haze becomes a veil. Held off the copy column on the left.
  reward: { radiusX: 0.6, radiusY: 0.3, centreX: 0.6, centreY: 0.72, intensity: 0.85, haze: 0.5, flare: 1 },
  // Pool tightens onto the phone; the floor around it goes back to black.
  work: { radiusX: 0.27, radiusY: 0.16, centreX: 0.43, centreY: 0.8, intensity: 0.52, haze: 0.04, flare: 0.06 },
  // Pool opens wide. The phone is small and centred in a large lit field.
  full: { radiusX: 0.54, radiusY: 0.2, centreX: 0.56, centreY: 0.78, intensity: 0.72, haze: 0.18, flare: 0.45 },
}

/** How long a state takes to reach the next one. It then holds. */
export const LIGHT_FADE_SEC = 1.2

export type LightCue = { at: number; state: LightState }

const mix = (from: number, to: number, t: number): number => from + (to - from) * t

const mixShape = (from: LightShape, to: LightShape, t: number): LightShape => ({
  radiusX: mix(from.radiusX, to.radiusX, t),
  radiusY: mix(from.radiusY, to.radiusY, t),
  centreX: mix(from.centreX, to.centreX, t),
  centreY: mix(from.centreY, to.centreY, t),
  intensity: mix(from.intensity, to.intensity, t),
  haze: mix(from.haze, to.haze, t),
  flare: mix(from.flare, to.flare, t),
})

export type LightNow = { state: LightState; shape: LightShape }

/**
 * The light at `sec`. The last cue at or before `sec` is the target; the cue
 * before it is where the transition started. After `LIGHT_FADE_SEC` the shape is
 * exactly the state's own, so a state holds until the next one.
 */
export const lightAt = (cues: LightCue[], sec: number): LightNow => {
  if (cues.length === 0) {
    return { state: "alone", shape: LIGHTS.alone }
  }
  let index = 0
  for (let cursor = 0; cursor < cues.length; cursor += 1) {
    if (sec >= cues[cursor].at) {
      index = cursor
    }
  }
  const cue = cues[index]
  if (index === 0 && sec < cue.at) {
    return { state: cue.state, shape: LIGHTS[cue.state] }
  }
  const previous = index === 0 ? cue : cues[index - 1]
  const t = Math.min(1, Math.max(0, (sec - cue.at) / LIGHT_FADE_SEC))
  if (t >= 1) {
    return { state: cue.state, shape: LIGHTS[cue.state] }
  }
  return { state: cue.state, shape: mixShape(LIGHTS[previous.state], LIGHTS[cue.state], ease(t)) }
}

/**
 * How lit a stage point is, 0..1. Used by the confetti: a particle only reads
 * inside the pool, so the shower falls *in* the light instead of dropping onto a
 * flat black field. `x` and `y` are stage fractions.
 */
export const poolLit = (shape: LightShape, x: number, y: number): number => {
  const dx = (x - shape.centreX) / shape.radiusX
  const dy = (y - shape.centreY) / shape.radiusY
  return Math.max(0, 1 - Math.sqrt(dx * dx + dy * dy))
}

// --- Parallax ---------------------------------------------------------------
//
// The camera drifts. The pool drifts slower than the camera, the haze faster,
// and the phone sits between them so any movement slides it across the light.
// The back wall barely moves at all. No two layers share a speed.

//
// The spread matters more than the magnitude: the wall barely moves, the pool
// slides across the floor, the phone carries the camera, and the haze crosses
// fastest of all. The floor is drawn on the phone's plane, because it is the
// plane the phone stands on, and that is what the pool slides across.
export const PARALLAX = {
  back: 0.08,
  pool: 0.4,
  phone: 1,
  haze: 1.8,
} as const

export type Layer = keyof typeof PARALLAX

/** Stage px for a layer, given the camera's own drift in px. */
export const parallax = (layer: Layer, drift: number): number => drift * PARALLAX[layer]

/** Drift is authored as a percentage of frame width per second. */
export const driftPercentToPx = (percent: number, stageWidth: number): number =>
  (percent / 100) * stageWidth
