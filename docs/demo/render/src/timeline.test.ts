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

  test("callouts the second pairing and captions the slash command panel", () => {
    const callouts = timeline.callouts.map((callout) => callout.title)
    const captions = timeline.captions.map((caption) => caption.text)

    expect(callouts).toContain("Pair another Harold")
    expect(captions).toContain("Slash commands from your agent")
  })

  test("boxes the mode and thinking controls", () => {
    const annotation = timeline.annotations.find(
      (entry) => entry.title === "Toggle modes supported by your agent",
    )

    expect(annotation).toBeDefined()
    expect(annotation?.nextTitle).toBe("Adjust thinking effort")
    expect(annotation?.at).toBeCloseTo(74.65, 2)
    expect(annotation?.moveAt).toBeCloseTo(79.55, 2)
    expect(annotation?.endAt).toBeCloseTo(82.35, 2)
    expect(
      timeline.captions.some(
        (caption) => caption.text === "Toggle modes supported by your agent",
      ),
    ).toBe(false)
    expect(
      timeline.captions.some((caption) => caption.text === "Adjust thinking effort"),
    ).toBe(false)
    expect(
      timeline.sounds.some(
        (sound) =>
          sound.name === "ping" && Math.abs(sound.at - (annotation?.at ?? 0)) < 0.01,
      ),
    ).toBe(true)
    expect(
      timeline.sounds.some(
        (sound) =>
          sound.name === "ping" && Math.abs(sound.at - (annotation?.moveAt ?? 0)) < 0.01,
      ),
    ).toBe(true)
  })

  test("puts the model list callout beside the phone", () => {
    const callout = timeline.callouts.find(
      (entry) => entry.title === "Model list from your Agent",
    )

    expect(callout).toBeDefined()
    expect(callout?.at).toBeCloseTo(69.56, 2)
    expect(callout?.compact).toBe(true)
    expect(callout?.placement).toBe("edge")
    expect(callout?.connector).toBe("t")
    expect(callout?.span).toEqual({ y: 0.67, h: 0.24 })
    expect(callout?.targetX).toBeCloseTo(0.5, 5)
    expect(callout?.targetY).toBeCloseTo(0.78, 5)
    expect(
      timeline.captions.some((caption) => caption.text === "Model list from your Agent"),
    ).toBe(false)
    expect(
      timeline.sounds.some(
        (sound) => sound.name === "ping" && Math.abs(sound.at - (callout?.at ?? 0)) < 0.01,
      ),
    ).toBe(true)
  })

  test("slides in a paper note for the new session caption", () => {
    const note = timeline.notes.find((entry) => entry.title === "Start a new Session")

    expect(note).toBeDefined()
    expect(note?.label).toBe("MAKE SOME HISTORY")
    expect(note?.at).toBeCloseTo(54.94, 2)
    expect(
      timeline.captions.some((caption) => caption.text === "Start a new session"),
    ).toBe(false)
    expect(
      timeline.sounds.some(
        (sound) => sound.name === "ping" && Math.abs(sound.at - (note?.at ?? 0)) < 0.01,
      ),
    ).toBe(true)
  })

  test("fans session cards for the history caption", () => {
    const fan = timeline.cardFans.find(
      (entry) => entry.title === "Access your agent session history",
    )

    expect(fan).toBeDefined()
    expect(fan?.eyebrow).toBe("SESSION HISTORY")
    expect(fan?.hint).toBe("Past sessions, one tap away.")
    expect(fan?.at).toBeCloseTo(44.96, 2)
    expect(
      timeline.captions.some((caption) => caption.text === "Access your agent session history"),
    ).toBe(false)
    expect(
      timeline.sounds.some(
        (sound) => sound.name === "ping" && Math.abs(sound.at - (fan?.at ?? 0)) < 0.01,
      ),
    ).toBe(true)
  })

  test("zooms the new session and pulls back on continue", () => {
    expect(channel(phoneCenterX, 60)).toBeCloseTo(1460, 5)
    expect(channel(phoneWidth, 60)).toBeCloseTo(760, 5)
    expect(channel(phoneTop, 60)).toBeCloseTo(-314.5, 5)
    expect(channel(phoneCenterX, 67.2)).toBeCloseTo(960, 5)
    expect(channel(phoneWidth, 67.2)).toBeCloseTo(450, 5)
    expect(channel(phoneTop, 67.2)).toBeCloseTo(30, 5)
  })

  test("anchors the Pair another Harold callout to the overflow tap", () => {
    const callout = timeline.callouts.find((entry) => entry.title === "Pair another Harold")

    expect(callout).toBeDefined()
    expect(callout?.at).toBeCloseTo(28.0, 5)
    expect(callout?.targetX).toBeCloseTo(1007 / 1080, 5)
    expect(callout?.targetY).toBeCloseTo(212 / 2400, 5)
    expect(timeline.captions.some((caption) => caption.text === "Pair another Harold")).toBe(false)
    expect(
      timeline.sounds.some((sound) => sound.name === "ping" && Math.abs(sound.at - 28.0) < 0.01),
    ).toBe(true)
  })
})
