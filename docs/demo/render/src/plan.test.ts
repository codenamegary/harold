import { describe, expect, test } from "bun:test"
import { readFileSync } from "node:fs"
import { REST } from "./body"
import { PRESETS } from "./camera"
import {
  NEW_SESSION_REST_LIGHT,
  newSessionCameraAt,
  newSessionLightAt,
  newSessionPoseAt,
} from "./newSession"
import { PLAN_CAMERA, planCameraAt, planLightAt, planPoseAt } from "./plan"
import { LIGHTS, LIGHT_FADE_SEC } from "./stage"
import { buildTimeline, type CaptureSlice } from "./timeline"

const capture = JSON.parse(
  readFileSync(new URL("../public/capture.json", import.meta.url), "utf8"),
) as { width: number; height: number; slices: CaptureSlice[] }

const plan = () => {
  const timeline = buildTimeline(capture.slices)
  const scene = timeline.scenes.find((entry) => entry.slug === "plan")
  const previous = timeline.scenes.find((entry) => entry.slug === "newSession")
  if (scene === undefined || previous === undefined) {
    throw new Error("the cut has no plan scene")
  }
  return { timeline, scene, previous, duration: scene.to - scene.from }
}

describe("plan / the handoff from new-session", () => {
  test("starts on the framing, pool, and straight pose new-session ends on", () => {
    const { scene, previous, duration } = plan()
    const previousDuration = previous.to - previous.from
    expect(scene.from).toBeCloseTo(previous.to, 9)
    expect(duration).toBeGreaterThan(0)
    expect(PLAN_CAMERA).toEqual(PRESETS.full)
    expect(planCameraAt()).toEqual(newSessionCameraAt(previousDuration))
    expect(planPoseAt()).toEqual(REST)
    expect(planPoseAt()).toEqual(newSessionPoseAt())
    expect(planLightAt(0)).toEqual(newSessionLightAt(previousDuration))
  })
})

describe("plan / camera", () => {
  test("holds the full phone for the whole act", () => {
    expect(planCameraAt()).toBe(PLAN_CAMERA)
    expect(planCameraAt()).toEqual(PRESETS.full)
  })
})

describe("plan / light", () => {
  test("opens exactly on new-session's resting pool", () => {
    expect(planLightAt(0)).toEqual({ state: "work", shape: NEW_SESSION_REST_LIGHT })
  })

  test("narrows into the working pool over the fade", () => {
    const middle = planLightAt(LIGHT_FADE_SEC / 2)
    expect(middle.state).toBe("work")
    expect(middle.shape).not.toEqual(NEW_SESSION_REST_LIGHT)
    expect(middle.shape).not.toEqual(LIGHTS.work)
    expect(middle.shape.radiusX).toBeLessThan(NEW_SESSION_REST_LIGHT.radiusX)
    expect(middle.shape.radiusX).toBeGreaterThan(LIGHTS.work.radiusX)
    expect(middle.shape.centreX).toBe(LIGHTS.work.centreX)
  })

  test("settles exactly on the working pool and holds it", () => {
    const { duration } = plan()
    expect(planLightAt(LIGHT_FADE_SEC)).toEqual({ state: "work", shape: LIGHTS.work })
    expect(planLightAt(LIGHT_FADE_SEC + 1)).toEqual({ state: "work", shape: LIGHTS.work })
    expect(planLightAt(duration)).toEqual({ state: "work", shape: LIGHTS.work })
  })
})

describe("plan / body", () => {
  test("holds the handset straight while the prompt is typed", () => {
    const { timeline, scene, duration } = plan()
    expect(planPoseAt()).toEqual(REST)
    expect(planPoseAt().rotateX).toBe(0)
    expect(planPoseAt().rotateY).toBe(0)
    expect(planPoseAt().rotateZ).toBe(0)
    expect(planPoseAt().scale).toBe(1)
    expect(timeline.poseAt(scene.from)).toEqual(REST)
    expect(timeline.poseAt(scene.from + duration / 2)).toEqual(REST)
    expect(timeline.poseAt(scene.to - 1e-3)).toEqual(REST)
  })
})
