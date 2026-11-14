import captureJson from "../public/capture.json"
import type { CaptureSlice } from "./timeline"

/**
 * The capture manifest as static facts. Scenes read the slices they need from
 * here. This module never knows about the cut, the scene order, or the edit.
 */
export type CaptureFile = {
  width: number
  height: number
  slices: CaptureSlice[]
}

export const CAPTURE = captureJson as CaptureFile

export const VIDEO = {
  width: CAPTURE.width,
  height: CAPTURE.height,
} as const

const byName = new Map(CAPTURE.slices.map((slice) => [slice.name, slice]))

export const slice = (name: string): CaptureSlice => {
  const found = byName.get(name)
  if (found === undefined) {
    throw new Error(`capture.json has no slice ${name}`)
  }
  return found
}

export const markAt = (sliceName: string, markName: string): number => {
  const found = slice(sliceName).marks?.find((mark) => mark.name === markName)
  if (found === undefined) {
    throw new Error(`slice ${sliceName} has no mark ${markName}`)
  }
  return found.atSec
}

export const tapAt = (sliceName: string, which: "first" | "last"): number => {
  const taps = [...(slice(sliceName).taps ?? [])].sort((a, b) => a.atSec - b.atSec)
  const tap = which === "first" ? taps[0] : taps[taps.length - 1]
  if (tap === undefined) {
    throw new Error(`slice ${sliceName} has no tap to cut on`)
  }
  return tap.atSec
}
