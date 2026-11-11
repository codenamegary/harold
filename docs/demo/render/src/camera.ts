// --- Camera -----------------------------------------------------------------
//
// The script's camera vocabulary. A preset names a framing, never a feature:
//
//   [PZ:full]              1x, full frame, in the current layout slot
//   [PZ:right-full]        1x, full frame, docked right
//   [PZ:top-two-thirds]    2x, framed on the top two thirds
//   [PZ:center-two-thirds] 2x, framed on the centre
//   [PZ:lower-center]      1.7x, focus lower centre
//   [PZ:lower-right]       2.6x, focus lower right
//   [PZ:upper-center]      1.6x, focus upper centre
//
// `scale` is magnification of the phone against the 1x framing, where 1x is the
// whole handset standing on the stage: `PHONE_FIT` of the stage height. `focus`
// is a point on the *phone screen*; the camera puts that point at the centre of
// the frame and clamps so the stage never shows through the phone.
//
// A camera state holds until the next one. Nothing here eases between states:
// a preset change is a cut, and a cut is how the film moves.

export type Point = { x: number; y: number }

export type CameraPreset =
  | "full"
  | "right-full"
  | "top-two-thirds"
  | "center-two-thirds"
  | "lower-center"
  | "lower-right"
  | "upper-center"

export type CameraState = {
  preset: CameraPreset
  scale: number
  focus: Point
  /** Fraction of the stage width the phone's centre sits at. */
  dock: number
}

export const PRESETS: Record<CameraPreset, CameraState> = {
  full: { preset: "full", scale: 1, focus: { x: 0.5, y: 0.5 }, dock: 0.5 },
  "right-full": { preset: "right-full", scale: 1, focus: { x: 0.5, y: 0.5 }, dock: 0.72 },
  "top-two-thirds": { preset: "top-two-thirds", scale: 2, focus: { x: 0.5, y: 0.25 }, dock: 0.5 },
  "center-two-thirds": { preset: "center-two-thirds", scale: 2, focus: { x: 0.5, y: 0.5 }, dock: 0.5 },
  "lower-center": { preset: "lower-center", scale: 1.7, focus: { x: 0.5, y: 0.78 }, dock: 0.5 },
  "lower-right": { preset: "lower-right", scale: 2.6, focus: { x: 0.78, y: 0.8 }, dock: 0.5 },
  "upper-center": { preset: "upper-center", scale: 1.6, focus: { x: 0.5, y: 0.22 }, dock: 0.5 },
}

/** The whole handset at 1x leaves this much of the stage height to the floor. */
export const PHONE_FIT = 0.82

export type CameraCueSpec = {
  /** Absolute seconds. */
  at: number
  preset?: CameraPreset
  scale?: number
  focus?: Point
  dock?: number
}

export type CameraCue = { at: number; state: CameraState }

/** Overrides apply on top of the named preset, exactly as `[PZ ... x=y]` does. */
export const resolveCameraCue = (spec: CameraCueSpec, fallback: CameraState): CameraState => {
  const base = spec.preset === undefined ? fallback : PRESETS[spec.preset]
  return {
    preset: base.preset,
    scale: spec.scale ?? base.scale,
    focus: spec.focus ?? base.focus,
    dock: spec.dock ?? base.dock,
  }
}

export const cameraAt = (cues: CameraCue[], sec: number): CameraState => {
  let current = cues[0]?.state ?? PRESETS.full
  for (const cue of cues) {
    if (sec < cue.at) {
      break
    }
    current = cue.state
  }
  return current
}

export type PhoneLayout = {
  /** Stage px per source px. */
  scale: number
  left: number
  top: number
  width: number
  height: number
  bezel: number
  frameWidth: number
  frameHeight: number
}

/**
 * Where the phone's screen sits on the stage at one camera state.
 *
 * `drift` is the camera's own drift in stage px. The phone moves with the camera
 * (they share a parallax factor of 1), so the drift is applied here and the wall,
 * pool and haze are offset from it.
 */
export const phoneLayout = (
  state: CameraState,
  videoWidth: number,
  videoHeight: number,
  stageWidth: number,
  stageHeight: number,
  drift: Point,
): PhoneLayout => {
  const aspect = videoWidth / videoHeight
  const width = stageHeight * PHONE_FIT * aspect * state.scale
  const height = width / aspect
  let left = state.dock * stageWidth + drift.x - width / 2
  let top = stageHeight / 2 + drift.y - state.focus.y * height
  // Never show the stage through the phone: when it is bigger than the frame it
  // is clamped to cover. When it is smaller it is free to stand in the light.
  if (width >= stageWidth) {
    left = Math.min(0, Math.max(stageWidth - width, left))
  }
  if (height >= stageHeight) {
    top = Math.min(0, Math.max(stageHeight - height, top))
  }
  const bezel = Math.max(8, Math.round(10 * Math.min(state.scale, 2.2)))
  return {
    scale: width / videoWidth,
    left,
    top,
    width,
    height,
    bezel,
    frameWidth: width + bezel * 2,
    frameHeight: height + bezel * 2,
  }
}

/** A `focus` point, in stage px, for anchor maths and stills QA. */
export const focusPoint = (layout: PhoneLayout, state: CameraState): Point => ({
  x: layout.left + state.focus.x * layout.width,
  y: layout.top + state.focus.y * layout.height,
})
