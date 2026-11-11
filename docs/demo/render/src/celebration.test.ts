import { describe, expect, test } from "bun:test"
import { readFileSync } from "node:fs"
import { celebrationStyle } from "./celebration"
import { CELEBRATION_AT, FPS, SCENES, buildTimeline, type CaptureSlice } from "./timeline"

const capture = JSON.parse(
  readFileSync(new URL("../public/capture.json", import.meta.url), "utf8"),
) as { slices: CaptureSlice[] }

const REST = { x: 0, y: 0, scaleX: 1, scaleY: 1, rotate: 0 }

const beat = { at: 10, hold: 1.5, strength: 1, confetti: true, confettiHold: 4.6 }

describe("celebrationStyle", () => {
  test("rests outside the beat", () => {
    expect(celebrationStyle([beat], 9.99)).toEqual(REST)
    expect(celebrationStyle([beat], 11.51)).toEqual(REST)
  })

  test("squashes wide and settles back", () => {
    const squash = celebrationStyle([beat], 10.12)
    expect(squash.scaleY).toBeLessThan(1)
    expect(squash.scaleX).toBeGreaterThan(1)
    expect(celebrationStyle([beat], 11.5).scaleY).toBeCloseTo(1, 2)
  })

  test("scales the squash with strength", () => {
    const full = celebrationStyle([beat], 10.12)
    const half = celebrationStyle([{ ...beat, strength: 0.5 }], 10.12)
    expect(Math.abs(half.scaleY - 1)).toBeLessThan(Math.abs(full.scaleY - 1))
  })
})

describe("celebration contract", () => {
  // The film has exactly one celebration: the achievement sits third, while the
  // cost of setting up SSH is still fresh. It carries the only confetti. The
  // close is a spotlight alone.
  test("exactly one celebration, at the achievement, carrying the confetti", () => {
    const timeline = buildTimeline(capture.slices)
    expect(timeline.celebrations.length).toBe(1)
    expect(timeline.confetti.length).toBe(1)
    const achievement = SCENES[2]
    expect(achievement.slug).toBe("achievement")
    const hinge = timeline.celebrations[0]
    expect(Math.round(hinge.at * FPS)).toBe(723)
    expect(hinge.at).toBeCloseTo(CELEBRATION_AT, 9)
    expect(hinge.at).toBeGreaterThanOrEqual(achievement.from)
    expect(hinge.at).toBeLessThan(achievement.to)
    expect(hinge.confetti).toBe(true)
    expect(timeline.confetti[0].at).toBe(hinge.at)
    expect(timeline.confetti[0].count).toBe(96)
  })

  test("the pop is silent, and the close does not move", () => {
    const timeline = buildTimeline(capture.slices)
    const hinge = timeline.celebrations[0]
    expect(celebrationStyle(timeline.celebrations, hinge.at - 0.02)).toEqual(REST)
    expect(celebrationStyle(timeline.celebrations, hinge.at + 0.12).scaleY).toBeLessThan(1)
    const pr = SCENES.find((scene) => scene.slug === "pr")
    if (pr === undefined) {
      throw new Error("no pr scene")
    }
    expect(celebrationStyle(timeline.celebrations, pr.from + 1)).toEqual(REST)
    expect(celebrationStyle(timeline.celebrations, pr.to - 0.01)).toEqual(REST)
  })
})
