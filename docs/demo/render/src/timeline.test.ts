import { describe, expect, test } from "bun:test"
import {
  buildTimeline,
  channel,
  clipFrame,
  phoneCenterX,
  phoneTop,
  phoneWidth,
  TERM_BOX,
  type CaptureSlice,
  type PhoneClip,
} from "./timeline"

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
    const clip = playClip("032-model_search.mp4")
    expect(clip.startSec).toBe(2.75)
    expect(clip.startSec + clip.duration * clip.rate).toBeGreaterThanOrEqual(4.5)

    const keys = keysBetween(clip.from, clip.from + clip.duration)
    expect(keys).toHaveLength("deepseek".length)
    expect(keys[0].at).toBeCloseTo(clip.from + (3.4 - clip.startSec) / clip.rate, 5)
    expect(keys[keys.length - 1].at).toBeCloseTo(clip.from + (4.5 - clip.startSec) / clip.rate, 5)
  })

  test("keeps the whole prompt on screen with its keys inside the typing window", () => {
    const clip = playClip("042-prompt_type.mp4")
    expect(clip.startSec).toBe(0.4)
    expect(clip.rate).toBe(1.3)
    expect(clip.startSec + clip.duration * clip.rate).toBeGreaterThanOrEqual(5.5)

    const text = "Do you think my cat's behaviour is strange?"
    const keys = keysBetween(clip.from, clip.from + clip.duration)
    expect(keys).toHaveLength(text.length)
    expect(keys[0].at).toBeCloseTo(clip.from + (0.55 - clip.startSec) / clip.rate, 5)
    expect(keys[keys.length - 1].at).toBeCloseTo(clip.from + (5.5 - clip.startSec) / clip.rate, 5)
  })

  test("types both identity names and the manual pairing details", () => {
    const first = playClip("005-first_name.mp4")
    const details = playClip("010-pair_another_details.mp4")
    const second = playClip("012-pair_another_name.mp4")

    expect(keysBetween(first.from, first.from + first.duration)).toHaveLength("Work".length)
    expect(keysBetween(second.from, second.from + second.duration)).toHaveLength("Couch".length)
    expect(keysBetween(details.from, details.from + details.duration)).toHaveLength(
      "http://127.0.0.1:3848".length + "GTN-5DK".length,
    )
  })
})

describe("spotlight beat", () => {
  test("puts the achievement copy on the left after pairing", () => {
    const spotlight = timeline.spotlights.find((entry) => entry.title === "Work from Couch")

    expect(spotlight).toBeDefined()
    expect(spotlight?.kicker).toBe("Achievement unlocked")
    expect(spotlight?.side).toBe("left")
    expect(spotlight?.at).toBeCloseTo(22.8, 5)
    expect(spotlight?.hold).toBeGreaterThanOrEqual(3)
    expect(timeline.captions.some((caption) => caption.text.includes("Achievement"))).toBe(false)
  })

  test("zooms the first pairing flow to the top two thirds", () => {
    expect(channel(phoneWidth, 15.0)).toBeCloseTo(380, 5)
    expect(channel(phoneTop, 15.0)).toBeCloseTo(108, 5)
    expect(channel(phoneWidth, 15.5)).toBeCloseTo(760, 5)
    expect(channel(phoneTop, 15.5)).toBeCloseTo(0, 5)
    expect(channel(phoneCenterX, 18.5)).toBeCloseTo(1460, 5)
    expect(channel(phoneTop, 20.7)).toBeCloseTo(0, 5)
    expect(channel(phoneTop, 21.2)).toBeCloseTo(-314.5, 5)
    expect(channel(phoneTop, 21.6)).toBeCloseTo(-314.5, 5)
    expect(channel(phoneTop, 22.8)).toBeCloseTo(-314.5, 5)
  })

  test("keeps the phone on the right and larger through the beat", () => {
    expect(channel(phoneCenterX, 24.5)).toBeCloseTo(1460, 5)
    expect(channel(phoneWidth, 24.5)).toBeCloseTo(760, 5)
    expect(channel(phoneTop, 24.5)).toBeCloseTo(-314.5, 5)
    expect(channel(phoneCenterX, 27.8)).toBeCloseTo(960, 5)
    expect(channel(phoneWidth, 27.8)).toBeCloseTo(450, 5)
  })

  test("lands one celebration as the terminal leaves", () => {
    expect(timeline.celebrations).toHaveLength(1)
    expect(timeline.celebrations[0].at).toBeCloseTo(23.3, 5)
  })

  test("adds confetti without a tap under the celebration", () => {
    expect(timeline.celebrations[0].confetti).toBe(true)
    expect(
      timeline.sounds.some((sound) => sound.name === "tap" && Math.abs(sound.at - 23.3) < 0.01),
    ).toBe(false)
  })
})

describe("new scenes", () => {
  test("plays the identity screen and both Harolds before the walkthrough moves on", () => {
    const played = timeline.clips
      .filter((clip) => clip.kind === "play")
      .map((clip) => clip.file)

    expect(played.some((file) => file.endsWith("005-first_name.mp4"))).toBe(true)
    expect(played.some((file) => file.endsWith("010-pair_another_details.mp4"))).toBe(true)
    expect(played.some((file) => file.endsWith("028-agent_pick_couch.mp4"))).toBe(true)
    expect(played.some((file) => file.endsWith("039-slash_open.mp4"))).toBe(true)
  })

  test("captions the second pairing and the slash command panel", () => {
    const captions = timeline.captions.map((caption) => caption.text)

    expect(captions).toContain("Pair another Harold")
    expect(captions).toContain("Slash commands from your agent")
  })
})
