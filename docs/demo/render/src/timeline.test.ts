import { describe, expect, test } from "bun:test"
import { buildTimeline, clipFrame, TERM_BOX, type CaptureSlice, type PhoneClip } from "./timeline"

const capture = (await Bun.file(new URL("../public/capture.json", import.meta.url)).json()) as {
  slices: CaptureSlice[]
}

const timeline = buildTimeline(capture.slices)

const playClip = (file: string) => {
  const clip = timeline.clips.find(
    (candidate) => candidate.kind === "play" && candidate.file.endsWith(file),
  )
  if (clip?.kind !== "play") {
    throw new Error(`no play clip for ${file}`)
  }
  return clip
}

const keysBetween = (from: number, to: number) =>
  timeline.sounds.filter((sound) => sound.name === "key" && sound.at >= from && sound.at < to)

describe("clipFrame", () => {
  test("maps render time onto the captured source from its in-point", () => {
    const clip: PhoneClip = {
      kind: "play",
      file: "slice.mp4",
      from: 10,
      duration: 2,
      rate: 2,
      startSec: 3.5,
    }

    expect(clipFrame(clip, 10)).toBe(3.5)
    expect(clipFrame(clip, 11)).toBe(5.5)
  })
})

describe("terminal layout", () => {
  test("keeps the terminal vertically centered in the 1080 stage", () => {
    expect(TERM_BOX.top * 2 + TERM_BOX.height).toBe(1080)
  })
})

describe("phone typing", () => {
  test("keeps the model search on screen with its keys inside the typing window", () => {
    const clip = playClip("018-model_search.mp4")
    expect(clip.startSec).toBe(2.75)
    expect(clip.startSec + clip.duration * clip.rate).toBeGreaterThanOrEqual(4.75)

    const keys = keysBetween(clip.from, clip.from + clip.duration)
    expect(keys).toHaveLength("deepseek".length)
    expect(keys[0].at).toBeCloseTo(clip.from + (3.9 - clip.startSec) / clip.rate, 5)
    expect(keys[keys.length - 1].at).toBeCloseTo(clip.from + (4.75 - clip.startSec) / clip.rate, 5)
  })

  test("keeps the whole prompt on screen with its keys inside the typing window", () => {
    const clip = playClip("026-prompt_type.mp4")
    expect(clip.startSec).toBe(0.45)
    expect(clip.startSec + clip.duration * clip.rate).toBeGreaterThanOrEqual(4.62)

    const text = "Do you think my cat's behaviour is strange?"
    const keys = keysBetween(clip.from, clip.from + clip.duration)
    expect(keys).toHaveLength(text.length)
    expect(keys[0].at).toBeCloseTo(clip.from + (0.82 - clip.startSec) / clip.rate, 5)
    expect(keys[keys.length - 1].at).toBeCloseTo(clip.from + (4.62 - clip.startSec) / clip.rate, 5)
  })
})
