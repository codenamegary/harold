import { slice } from "./capture"
import {
  FPS,
  buildClips,
  buildKeys,
  buildSounds,
  buildTaps,
  playbackFrames,
  tapSec,
  type CaptureSlice,
  type Celebration,
  type Confetti,
  type CopyItem,
  type Keyframes,
  type PhoneClip,
  type Ripple,
  type SceneSlug,
  type Shot,
  type Sound,
} from "./timeline"

type LocalBound = number | "firstTap" | "lastTap" | string

export type LocalShotSpec = {
  slice: string
  from?: LocalBound
  to?: LocalBound
  holdAtSec?: number
  holdSec?: number
}

export type SceneCutSpec = {
  scene: SceneSlug
  /** Local seconds before the phone appears. The opening uses this for the intro. */
  leadInSec?: number
  shots: LocalShotSpec[]
  /** Hold the last source frame for this many local seconds after the shots. */
  tailHoldSec?: number
  copy?: CopyItem[]
  celebrations?: Celebration[]
  confetti?: Confetti[]
  phoneFade?: Keyframes
}

export type SceneCut = {
  durationInFrames: number
  clips: PhoneClip[]
  copy: CopyItem[]
  sounds: Sound[]
  ripples: Ripple[]
  celebrations: Celebration[]
  confetti: Confetti[]
  phoneFade: Keyframes
}

const sourceBound = (
  value: LocalBound | undefined,
  fallback: number,
  data: CaptureSlice,
): number => {
  if (value === undefined) {
    return fallback
  }
  if (value === "firstTap") {
    return tapSec(data, "first")
  }
  if (value === "lastTap") {
    return tapSec(data, "last")
  }
  if (typeof value === "number") {
    return value
  }
  const found = data.marks?.find((mark) => mark.name === value)
  if (found === undefined) {
    throw new Error(`${data.name} has no mark ${value}`)
  }
  return found.atSec
}

const windowFor = (
  spec: LocalShotSpec,
  data: CaptureSlice,
): { startSec: number; spanSec: number; hold: boolean } => {
  if (spec.holdSec !== undefined) {
    return { startSec: spec.holdAtSec ?? 0, spanSec: spec.holdSec, hold: true }
  }
  const startSec = sourceBound(spec.from, 0, data)
  const endSec = sourceBound(spec.to, data.durationSec, data)
  return { startSec, spanSec: Math.max(0, endSec - startSec), hold: false }
}

type RawShot = {
  spec: LocalShotSpec
  data: CaptureSlice
  window: { startSec: number; spanSec: number; hold: boolean }
  frames: number
}

const rawShot = (spec: LocalShotSpec): RawShot => {
  const data = slice(spec.slice)
  const window = windowFor(spec, data)
  return { spec, data, window, frames: playbackFrames(window.spanSec) }
}

/**
 * Build one scene's local cut. Every boundary is local to the scene. The only
 * shared facts are the capture slices and their marks, taps, and keys.
 */
export const buildSceneCut = (spec: SceneCutSpec): SceneCut => {
  const raw: RawShot[] = spec.shots.map(rawShot)

  if (spec.tailHoldSec !== undefined && spec.tailHoldSec > 0) {
    const last = raw[raw.length - 1]
    if (last === undefined) {
      throw new Error(`scene ${spec.scene} has a tail hold but no shots`)
    }
    const holdAtSec = last.window.hold
      ? last.window.startSec
      : Math.min(last.data.durationSec, last.window.startSec + last.window.spanSec)
    raw.push(
      rawShot({
        slice: last.spec.slice,
        holdAtSec,
        holdSec: spec.tailHoldSec,
      }),
    )
  }

  let cursor = Math.round((spec.leadInSec ?? 0) * FPS)
  const starts: number[] = []
  for (const shot of raw) {
    starts.push(cursor / FPS)
    cursor += shot.frames
  }
  const durationInFrames = cursor
  const endSec = durationInFrames / FPS

  const shots: Shot[] = raw.map((shot, index) => {
    const at = starts[index] ?? 0
    const until = starts[index + 1] ?? endSec
    const slot = until - at
    return {
      scene: spec.scene,
      slice: shot.spec.slice,
      at,
      until,
      startSec: shot.window.startSec,
      rate: 1,
      duration: shot.window.hold ? slot : Math.min(shot.window.spanSec, slot),
      hold: shot.window.hold,
      tapLead: 0,
      drift: 0,
      data: shot.data,
    }
  })

  const copy = spec.copy ?? []
  const taps = buildTaps(shots)
  const keys = buildKeys(shots)

  return {
    durationInFrames,
    clips: buildClips(shots),
    copy,
    sounds: buildSounds(taps, keys, copy),
    ripples: taps.map((tap) => ({ at: tap.at, x: tap.x, y: tap.y })),
    celebrations: spec.celebrations ?? [],
    confetti: spec.confetti ?? [],
    phoneFade: spec.phoneFade ?? [[0, 1]],
  }
}
