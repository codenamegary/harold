import { describe, expect, test } from "bun:test"
import { readFileSync } from "node:fs"
import {
  ACHIEVEMENT_FRAMING,
  ACHIEVEMENT_HANDOFF,
  ACHIEVEMENT_LEAN,
  ACHIEVEMENT_LEAN_SEC,
  achievementCameraAt,
  achievementLightAt,
  achievementPoseAt,
} from "./achievement"
import { REST } from "./body"
import { CAMERA_EASE_SEC, VERTICAL_FIT, phoneLayout } from "./camera"
import { SPOT_COLUMN, SPOT_INSET } from "./copy"
import { openingCameraAt, openingPoseAt } from "./opening"
import { LIGHTS, LIGHT_FADE_SEC } from "./stage"
import { buildTimeline, type CaptureSlice } from "./timeline"

const capture = JSON.parse(
  readFileSync(new URL("../public/capture.json", import.meta.url), "utf8"),
) as { width: number; height: number; slices: CaptureSlice[] }

const STAGE_W = 1920
const STAGE_H = 1080

const achievement = () => {
  const timeline = buildTimeline(capture.slices)
  const scene = timeline.scenes.find((entry) => entry.slug === "achievement")
  if (scene === undefined) {
    throw new Error("the cut has no achievement scene")
  }
  return { timeline, scene, duration: scene.to - scene.from }
}

describe("achievement / the handoff from the opening", () => {
  test("starts on the filled frame and rest pose the opening ends on", () => {
    const { scene, duration } = achievement()
    expect(achievementCameraAt(0)).toEqual(ACHIEVEMENT_HANDOFF)
    expect(achievementCameraAt(0)).toEqual(openingCameraAt(scene.from))
    const start = achievementPoseAt(0, duration)
    const opening = openingPoseAt(scene.from)
    for (const field of ["x", "y", "rotateZ", "rotateY", "rotateX", "scale"] as const) {
      expect(start[field]).toBeCloseTo(opening[field], 9)
    }
  })
})

describe("achievement / camera and layout", () => {
  test("eases from the filled handoff into the right slot", () => {
    const { duration } = achievement()
    expect(ACHIEVEMENT_HANDOFF.scale).toBeCloseTo(VERTICAL_FIT, 9)
    const middle = achievementCameraAt(CAMERA_EASE_SEC / 2)
    expect(middle.scale).toBeGreaterThan(VERTICAL_FIT)
    expect(middle.scale).toBeLessThan(ACHIEVEMENT_FRAMING.scale)
    expect(achievementCameraAt(CAMERA_EASE_SEC)).toEqual(ACHIEVEMENT_FRAMING)
    expect(achievementCameraAt(duration)).toEqual(ACHIEVEMENT_FRAMING)
  })

  test("the phone frame clears the left spotlight column", () => {
    const state = achievementCameraAt(CAMERA_EASE_SEC + 0.05)
    const layout = phoneLayout(state, capture.width, capture.height, STAGE_W, STAGE_H, {
      x: 0,
      y: 0,
    })
    expect(layout.left - layout.bezel).toBeGreaterThan(SPOT_INSET + SPOT_COLUMN + 48)
  })
})

describe("achievement / light", () => {
  test("blooms from arrival into the reward pool", () => {
    expect(achievementLightAt(0).shape).toEqual(LIGHTS.arrival)
    expect(achievementLightAt(0).state).toBe("reward")
    const middle = achievementLightAt(LIGHT_FADE_SEC / 2)
    expect(middle.shape.flare).toBeGreaterThan(0)
    expect(middle.shape.flare).toBeLessThan(1)
    expect(achievementLightAt(LIGHT_FADE_SEC)).toEqual({ state: "reward", shape: LIGHTS.reward })
  })
})

describe("achievement / body", () => {
  test("leans in as the home screen lands, then settles before new-session", () => {
    const { duration } = achievement()
    expect(achievementPoseAt(0, duration)).toEqual(REST)
    expect(achievementPoseAt(ACHIEVEMENT_LEAN_SEC, duration)).toEqual(ACHIEVEMENT_LEAN)
    expect(achievementPoseAt(duration - 1, duration)).toEqual(ACHIEVEMENT_LEAN)
    const settling = achievementPoseAt(duration - 0.3, duration)
    expect(settling.rotateX).toBeGreaterThan(ACHIEVEMENT_LEAN.rotateX)
    expect(settling.rotateX).toBeLessThan(0)
    expect(achievementPoseAt(duration, duration)).toEqual(REST)
  })

  test("holds clear of the left copy", () => {
    const { duration } = achievement()
    const held = achievementPoseAt(duration - 1, duration)
    expect(held.scale).toBeLessThanOrEqual(1.02)
    expect(held.x).toBeGreaterThanOrEqual(0)
  })
})
