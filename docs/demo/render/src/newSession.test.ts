import { describe, expect, test } from "bun:test"
import { readFileSync } from "node:fs"
import {
  ACHIEVEMENT_FRAMING,
  achievementCameraAt,
  achievementPoseAt,
} from "./achievement"
import { REST, idleGainForScale } from "./body"
import { CAMERA_EASE_SEC, PRESETS, phoneLayout } from "./camera"
import {
  NEW_SESSION_BACK_SEC,
  NEW_SESSION_FORM,
  NEW_SESSION_HANDOFF,
  NEW_SESSION_IDLE_FADE_SEC,
  NEW_SESSION_PUSH_SEC,
  NEW_SESSION_REST_LIGHT,
  NEW_SESSION_SETTLE_SEC,
  NEW_SESSION_WIDE_LIGHT,
  newSessionCameraAt,
  newSessionIdleGainAt,
  newSessionLightAt,
  newSessionPoseAt,
} from "./newSession"
import { LIGHTS, LIGHT_FADE_SEC } from "./stage"
import { buildTimeline, type CaptureSlice } from "./timeline"

const capture = JSON.parse(
  readFileSync(new URL("../public/capture.json", import.meta.url), "utf8"),
) as { width: number; height: number; slices: CaptureSlice[] }

const newSession = () => {
  const timeline = buildTimeline(capture.slices)
  const scene = timeline.scenes.find((entry) => entry.slug === "newSession")
  const achievement = timeline.scenes.find((entry) => entry.slug === "achievement")
  if (scene === undefined || achievement === undefined) {
    throw new Error("the cut has no new-session scene")
  }
  return {
    scene,
    duration: scene.to - scene.from,
    achievementDuration: achievement.to - achievement.from,
  }
}

describe("new session / the handoff from the achievement", () => {
  test("starts on the achievement's framing and rest pose", () => {
    const { achievementDuration } = newSession()
    expect(NEW_SESSION_HANDOFF).toEqual(ACHIEVEMENT_FRAMING)
    expect(newSessionCameraAt(0)).toEqual(ACHIEVEMENT_FRAMING)
    expect(newSessionCameraAt(0)).toEqual(achievementCameraAt(achievementDuration))
    expect(newSessionPoseAt()).toEqual(REST)
    expect(newSessionPoseAt()).toEqual(achievementPoseAt(achievementDuration, achievementDuration))
  })
})

describe("new session / camera", () => {
  test("returns to centre, pushes in on the form, then pulls back for the chat", () => {
    const { duration } = newSession()
    expect(NEW_SESSION_PUSH_SEC).toBeGreaterThan(NEW_SESSION_SETTLE_SEC)
    const wide = newSessionCameraAt(NEW_SESSION_SETTLE_SEC)
    expect(wide).toEqual(PRESETS.full)
    expect(newSessionCameraAt(NEW_SESSION_PUSH_SEC).scale).toBe(wide.scale)
    const middle = newSessionCameraAt(NEW_SESSION_PUSH_SEC + CAMERA_EASE_SEC * 0.45)
    expect(middle.scale).toBeGreaterThan(wide.scale)
    expect(middle.scale).toBeLessThan(NEW_SESSION_FORM.scale)
    expect(newSessionCameraAt(NEW_SESSION_PUSH_SEC + CAMERA_EASE_SEC + 0.05)).toEqual(
      NEW_SESSION_FORM,
    )
    expect(newSessionCameraAt(NEW_SESSION_BACK_SEC + CAMERA_EASE_SEC + 0.05)).toEqual(PRESETS.full)
    expect(newSessionCameraAt(duration)).toEqual(PRESETS.full)
  })

  test("the form close-up anchors the top of the app screen to the top edge", () => {
    const state = newSessionCameraAt(NEW_SESSION_PUSH_SEC + CAMERA_EASE_SEC + 0.05)
    const layout = phoneLayout(state, capture.width, capture.height, 1920, 1080, { x: 0, y: 0 })
    expect(layout.top).toBeCloseTo(0, 1)
    expect(layout.height).toBeGreaterThan(1080)
  })

  test("a camera state holds until the next one", () => {
    const wide = newSessionCameraAt(NEW_SESSION_SETTLE_SEC)
    expect(newSessionCameraAt(1).scale).toBe(wide.scale)
    expect(newSessionCameraAt(1.8).scale).toBe(wide.scale)
  })
})

describe("new session / light", () => {
  test("fades from the reward pool into the new-session pool", () => {
    expect(newSessionLightAt(0).state).toBe("work")
    expect(newSessionLightAt(0).shape).toEqual(LIGHTS.reward)
    const middle = newSessionLightAt(LIGHT_FADE_SEC / 2)
    expect(middle.state).toBe("work")
    expect(middle.shape).not.toEqual(LIGHTS.reward)
    expect(middle.shape).not.toEqual(NEW_SESSION_REST_LIGHT)
    expect(newSessionLightAt(LIGHT_FADE_SEC)).toEqual({
      state: "work",
      shape: NEW_SESSION_REST_LIGHT,
    })
  })

  test("widens with the push-in, holds, then settles wider than work", () => {
    const work = LIGHTS.work
    expect(newSessionLightAt(1.5).shape).toEqual(NEW_SESSION_REST_LIGHT)
    const widening = newSessionLightAt(NEW_SESSION_PUSH_SEC + 0.4).shape
    expect(widening.radiusX).toBeGreaterThan(work.radiusX)
    expect(widening.radiusX).toBeLessThan(NEW_SESSION_WIDE_LIGHT.radiusX)
    expect(newSessionLightAt(NEW_SESSION_PUSH_SEC + CAMERA_EASE_SEC).shape).toEqual(
      NEW_SESSION_WIDE_LIGHT,
    )
    expect(NEW_SESSION_WIDE_LIGHT.centreY).toBeGreaterThan(work.centreY)
    expect(NEW_SESSION_WIDE_LIGHT.centreY + NEW_SESSION_WIDE_LIGHT.radiusY).toBeGreaterThan(1)
    expect(newSessionLightAt(3.5).shape).toEqual(NEW_SESSION_WIDE_LIGHT)
    const narrowing = newSessionLightAt(NEW_SESSION_BACK_SEC + 0.4).shape
    expect(narrowing.radiusX).toBeGreaterThan(NEW_SESSION_REST_LIGHT.radiusX)
    expect(narrowing.radiusX).toBeLessThan(NEW_SESSION_WIDE_LIGHT.radiusX)
    expect(newSessionLightAt(NEW_SESSION_BACK_SEC + CAMERA_EASE_SEC).shape).toEqual(
      NEW_SESSION_REST_LIGHT,
    )
    expect(newSessionLightAt(5).shape).toEqual(NEW_SESSION_REST_LIGHT)
    expect(NEW_SESSION_REST_LIGHT.radiusX).toBeGreaterThan(work.radiusX)
  })

  test("the resting pool is large, forward, and holds the phone's feet", () => {
    const layout = phoneLayout(PRESETS.full, capture.width, capture.height, 1920, 1080, {
      x: 0,
      y: 0,
    })
    const feet = (layout.top + layout.height) / 1080
    expect(NEW_SESSION_REST_LIGHT.centreY).toBeGreaterThan(feet)
    expect(Math.abs(feet - NEW_SESSION_REST_LIGHT.centreY)).toBeLessThan(
      NEW_SESSION_REST_LIGHT.radiusY * 0.5,
    )
    expect(NEW_SESSION_REST_LIGHT.centreY + NEW_SESSION_REST_LIGHT.radiusY).toBeGreaterThan(1)
  })
})

describe("new session / body", () => {
  test("returns to centre and holds for the whole act", () => {
    expect(newSessionPoseAt()).toEqual(REST)
  })

  test("holds the phone still while the camera is not moving", () => {
    expect(newSessionIdleGainAt(0, 2)).toBeCloseTo(idleGainForScale(2), 9)
    expect(newSessionIdleGainAt(NEW_SESSION_IDLE_FADE_SEC, 1)).toBe(0)
    expect(newSessionIdleGainAt(0.6, 1)).toBe(0)
    expect(newSessionIdleGainAt(1.8, 1)).toBe(0)
  })
})
