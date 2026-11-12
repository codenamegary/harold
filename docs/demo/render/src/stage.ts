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

// The five states are five different lights, not five shades of one gradient.
// Each one changes the shape, so a paused frame tells you which act you are in.
//
// The pool sits on the floor. `alone` is wide and dim, centred under the
// lockup. `arrival` is brighter and sits a little left of the phone, so the
// phone stands just inside it and is lit from that side. It is authored for the
// frame-filling phone, whose feet are at the bottom of the frame, so only the
// far half of the pool shows. `reward` floods the floor under the phone and is
// the only flare. Its left edge stays right of the copy column. `work` is a
// tight hot pool and the haze drops. `full` is a wide centred field.
export const LIGHTS: Record<LightState, LightShape> = {
  alone: { radiusX: 0.3, radiusY: 0.06, centreX: 0.5, centreY: 0.82, intensity: 0.4, haze: 0.5, flare: 0 },
  arrival: { radiusX: 0.34, radiusY: 0.13, centreX: 0.4, centreY: 0.985, intensity: 0.92, haze: 0.8, flare: 0 },
  reward: { radiusX: 0.3, radiusY: 0.12, centreX: 0.74, centreY: 0.83, intensity: 1, haze: 1, flare: 1 },
  work: { radiusX: 0.125, radiusY: 0.08, centreX: 0.5, centreY: 0.84, intensity: 1, haze: 0.22, flare: 0 },
  full: { radiusX: 0.46, radiusY: 0.13, centreX: 0.5, centreY: 0.82, intensity: 0.76, haze: 0.4, flare: 0 },
}

/** How far a flare ring spreads past the pool, as a multiple of the pool radius. */
export const FLARE_SPREAD = 1.12

/** Where the floor meets the wall, as a fraction of the stage height. */
export const HORIZON = 0.667

/** The lamp hangs this many pool half-widths above the pool. */
export const BEAM_RISE = 4

/** The lamp's own width, as a fraction of the pool's. */
export const BEAM_APERTURE = 0.08

export type BeamCone = {
  /** The lamp. Straight above the pool, far above the frame. */
  apexX: number
  apexY: number
  apexHalf: number
  /** The pool. The cone's foot is the ellipse itself. */
  footX: number
  footY: number
  footHalfX: number
  footHalfY: number
}

/**
 * The shaft, as a cone from the lamp to the pool. The foot is the pool
 * ellipse: same centre, same radii, same parallax. So the beam stays on the
 * circle while the camera drifts, and a wide pool gets a wide shaft.
 */
export const beamCone = (
  shape: LightShape,
  stageWidth: number,
  stageHeight: number,
  driftX: number,
): BeamCone => {
  const footHalfX = shape.radiusX * stageWidth
  const footX = shape.centreX * stageWidth + parallax("pool", driftX)
  const footY = shape.centreY * stageHeight
  return {
    apexX: footX,
    apexY: footY - footHalfX * BEAM_RISE,
    apexHalf: footHalfX * BEAM_APERTURE,
    footX,
    footY,
    footHalfX,
    footHalfY: shape.radiusY * stageHeight,
  }
}

/** Half the shaft's width at stage height `y`. It is the pool's width at the floor. */
export const beamHalfAt = (cone: BeamCone, y: number): number => {
  const t = Math.min(1, Math.max(0, (y - cone.apexY) / (cone.footY - cone.apexY)))
  return cone.apexHalf + (cone.footHalfX - cone.apexHalf) * t
}

/** How long a state takes to reach the next one. It then holds. */
export const LIGHT_FADE_SEC = 1.2

export type LightCue = { at: number; state: LightState }

const mix = (from: number, to: number, t: number): number => from + (to - from) * t

/** Blend two shapes, field by field. `t` is not eased here. */
export const mixShape = (from: LightShape, to: LightShape, t: number): LightShape => ({
  radiusX: mix(from.radiusX, to.radiusX, t),
  radiusY: mix(from.radiusY, to.radiusY, t),
  centreX: mix(from.centreX, to.centreX, t),
  centreY: mix(from.centreY, to.centreY, t),
  intensity: mix(from.intensity, to.intensity, t),
  haze: mix(from.haze, to.haze, t),
  flare: mix(from.flare, to.flare, t),
})

export type LightNow = { state: LightState; shape: LightShape }

/** Blend two named lights. `t` 0 is `from`, 1 is `to`. */
export const mixLights = (from: LightState, to: LightState, t: number): LightNow => {
  const progress = Math.min(1, Math.max(0, t))
  if (progress >= 1) {
    return { state: to, shape: LIGHTS[to] }
  }
  if (progress <= 0) {
    return { state: from, shape: LIGHTS[from] }
  }
  return { state: to, shape: mixShape(LIGHTS[from], LIGHTS[to], ease(progress)) }
}

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

// --- The world --------------------------------------------------------------
//
// The stage is drawn in world space. A view places the world on the screen:
// `screen = view.xy + world * view.scale`. Most of the film looks at the world
// one to one. The opening looks at it from further back, then pushes in, so the
// floor, the pool and the shaft grow with the phone instead of the phone
// inflating on a still backdrop.

export type WorldView = { scale: number; x: number; y: number }

export const SCREEN_VIEW: WorldView = { scale: 1, x: 0, y: 0 }

/** A light authored on the screen, moved into the world that `view` looks at. */
export const shapeToWorld = (
  shape: LightShape,
  view: WorldView,
  stageWidth: number,
  stageHeight: number,
): LightShape => ({
  ...shape,
  radiusX: shape.radiusX / view.scale,
  radiusY: shape.radiusY / view.scale,
  centreX: (shape.centreX * stageWidth - view.x) / view.scale / stageWidth,
  centreY: (shape.centreY * stageHeight - view.y) / view.scale / stageHeight,
})

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
