import { Easing } from "remotion"
import { type WorldView } from "./stage"

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
// A camera state holds until the next cue, then eases. The phone never cuts
// from one framing to the next.

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

/**
 * Scale at which the handset fills the stage height, bezel included.
 * Screen height is `stageHeight * PHONE_FIT * scale`, and the bezel is about
 * `10 * scale` on each edge. 1.18 lands the frame a few pixels inside 1080p.
 */
export const VERTICAL_FIT = 1.18

/** Wide entrance. Small enough that the phone can walk into the pool from further back. */
export const ENTRANCE_SCALE = 0.52

/** How long a framing takes to become the next one. It then holds. */
export const CAMERA_EASE_SEC = 0.85

const cameraEase = Easing.bezier(0.45, 0, 0.2, 1)

export type CameraCueSpec = {
  /** Absolute seconds. */
  at: number
  preset?: CameraPreset
  scale?: number
  focus?: Point
  dock?: number
  /** How long this cue takes to reach. Defaults to CAMERA_EASE_SEC. */
  easeSec?: number
}

export type CameraCue = { at: number; state: CameraState; easeSec: number }

/**
 * How much of the camera drift the phone takes. Wide idle shots ride the
 * parallax. Once the handset fills the frame, it holds still.
 */
export const phoneDriftGain = (scale: number): number => {
  if (scale <= 1) {
    return 1
  }
  if (scale >= VERTICAL_FIT) {
    return 0
  }
  return (VERTICAL_FIT - scale) / (VERTICAL_FIT - 1)
}

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

const mix = (from: number, to: number, t: number): number => from + (to - from) * t

const mixCamera = (from: CameraState, to: CameraState, t: number): CameraState => ({
  preset: to.preset,
  scale: mix(from.scale, to.scale, t),
  focus: { x: mix(from.focus.x, to.focus.x, t), y: mix(from.focus.y, to.focus.y, t) },
  dock: mix(from.dock, to.dock, t),
})

/**
 * The framing at `sec`. The cue at or before `sec` is the target. The move
 * starts on that cue and takes `CAMERA_EASE_SEC`, then the framing holds.
 * The first cue is already there, so the phone is not born mid-zoom.
 */
export const cameraAt = (cues: CameraCue[], sec: number): CameraState => {
  if (cues.length === 0) {
    return PRESETS.full
  }
  let index = 0
  for (let cursor = 1; cursor < cues.length; cursor += 1) {
    if (sec >= cues[cursor].at) {
      index = cursor
    }
  }
  const cue = cues[index]
  if (index === 0) {
    return cue.state
  }
  const previous = cues[index - 1]
  const window = Math.min(cue.easeSec, Math.max(0, cue.at - previous.at))
  if (window <= 0) {
    return cue.state
  }
  const t = Math.min(1, Math.max(0, (sec - cue.at) / window))
  if (t >= 1) {
    return cue.state
  }
  return mixCamera(previous.state, cue.state, cameraEase(t))
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

/**
 * The view of the world that keeps the floor under the phone.
 *
 * `locked` is the framing the world is drawn for, one to one. At any other
 * framing the world scales with the phone and stays pinned to its feet, so a
 * push-in is a camera move and not a phone that grows on a still backdrop.
 * Both layouts are taken without drift. The drift is the layers' own parallax.
 */
export const worldView = (now: PhoneLayout, locked: PhoneLayout): WorldView => {
  const scale = now.width / locked.width
  return {
    scale,
    x: now.left + now.width / 2 - (locked.left + locked.width / 2) * scale,
    y: now.top + now.height - (locked.top + locked.height) * scale,
  }
}

/** A `focus` point, in stage px, for anchor maths and stills QA. */
export const focusPoint = (layout: PhoneLayout, state: CameraState): Point => ({
  x: layout.left + state.focus.x * layout.width,
  y: layout.top + state.focus.y * layout.height,
})
