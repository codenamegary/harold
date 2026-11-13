import { describe, expect, test } from "bun:test"
import {
  ACHIEVEMENT_FRAMING,
  ACHIEVEMENT_HANDOFF,
  ACHIEVEMENT_LEAN,
  ACHIEVEMENT_LEAN_SEC,
  achievementCameraAt,
  achievementLightAt,
  achievementPoseAt,
} from "./achievement"
import { ACHIEVEMENT_DURATION } from "./achievement.cut"
import { REST } from "./body"
import { CAMERA_EASE_SEC, VERTICAL_FIT, phoneLayout } from "./camera"
import { VIDEO } from "./capture"
import { SPOT_COLUMN, SPOT_INSET } from "./copy"
import { OPENING_DURATION } from "./opening.cut"
import { openingCameraAt, openingPoseAt } from "./opening"
import { LIGHTS, LIGHT_FADE_SEC } from "./stage"
import { FPS } from "./timeline"

const duration = ACHIEVEMENT_DURATION / FPS

describe("achievement / the handoff from the opening", () => {
  test("starts on the filled frame and rest pose the opening ends on", () => {
    expect(achievementCameraAt(0)).toEqual(ACHIEVEMENT_HANDOFF)
    expect(achievementCameraAt(0)).toEqual(openingCameraAt(OPENING_DURATION / FPS))
    const start = achievementPoseAt(0, duration)
    const opening = openingPoseAt(OPENING_DURATION / FPS)
    for (const field of ["x", "y", "rotateZ", "rotateY", "rotateX", "scale"] as const) {
      expect(start[field]).toBeCloseTo(opening[field], 9)
    }
  })
})

describe("achievement / camera and layout", () => {
  test("eases from the filled handoff into the right slot", () => {
    expect(ACHIEVEMENT_HANDOFF.scale).toBeCloseTo(VERTICAL_FIT, 9)
    const middle = achievementCameraAt(CAMERA_EASE_SEC / 2)
    expect(middle.scale).toBeGreaterThan(VERTICAL_FIT)
    expect(middle.scale).toBeLessThan(ACHIEVEMENT_FRAMING.scale)
    expect(achievementCameraAt(CAMERA_EASE_SEC)).toEqual(ACHIEVEMENT_FRAMING)
    expect(achievementCameraAt(duration)).toEqual(ACHIEVEMENT_FRAMING)
  })

  test("the phone frame clears the left spotlight column", () => {
    const state = achievementCameraAt(CAMERA_EASE_SEC + 0.05)
    const layout = phoneLayout(state, VIDEO.width, VIDEO.height, 1920, 1080, {
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
    expect(achievementPoseAt(0, duration)).toEqual(REST)
    expect(achievementPoseAt(ACHIEVEMENT_LEAN_SEC, duration)).toEqual(ACHIEVEMENT_LEAN)
    expect(achievementPoseAt(duration - 1, duration)).toEqual(ACHIEVEMENT_LEAN)
    const settling = achievementPoseAt(duration - 0.3, duration)
    expect(settling.rotateX).toBeGreaterThan(ACHIEVEMENT_LEAN.rotateX)
    expect(settling.rotateX).toBeLessThan(0)
    expect(achievementPoseAt(duration, duration)).toEqual(REST)
  })

  test("holds clear of the left copy", () => {
    const held = achievementPoseAt(duration - 1, duration)
    expect(held.scale).toBeLessThanOrEqual(1.02)
    expect(held.x).toBeGreaterThanOrEqual(0)
  })
})
