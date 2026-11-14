import { describe, expect, test } from "bun:test"
import { readFileSync } from "node:fs"
import { REST } from "./body"
import { CAMERA_EASE_SEC, PRESETS, VERTICAL_FIT } from "./camera"
import {
  NEW_SESSION_REST_LIGHT,
  newSessionCameraAt,
  newSessionLightAt,
  newSessionPoseAt,
} from "./newSession"
import {
  PLAN_CAMERA,
  PLAN_CLOSE,
  PLAN_PUSH_SEC,
  planCameraAt,
  planLightAt,
  planPoseAt,
} from "./plan"
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
    expect(planCameraAt(0)).toEqual(newSessionCameraAt(previousDuration))
    expect(planPoseAt(0)).toEqual(REST)
    expect(planPoseAt(0)).toEqual(newSessionPoseAt())
    expect(planLightAt(0)).toEqual(newSessionLightAt(previousDuration))
  })
})

describe("plan / camera", () => {
  test("starts full, pushes in for the attachments, and returns full for the handoff", () => {
    const { duration } = plan()
    expect(planCameraAt(0)).toEqual(PRESETS.full)
    expect(PLAN_CLOSE.scale).toBe(VERTICAL_FIT)
    expect(planCameraAt(PLAN_PUSH_SEC + CAMERA_EASE_SEC)).toEqual(PLAN_CLOSE)
    expect(planCameraAt(duration)).toEqual(PRESETS.full)
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
  test("leans through the attach beat, then holds straight for the mode tap and typing", () => {
    const { timeline, scene, duration } = plan()
    expect(planPoseAt(0)).toEqual(REST)
    expect(planPoseAt(0.8)).not.toEqual(REST)
    expect(planPoseAt(2)).toEqual(REST)
    expect(planPoseAt(8)).toEqual(REST)
    expect(planPoseAt(duration)).toEqual(REST)
    expect(timeline.poseAt(scene.from)).toEqual(REST)
    const fromTimeline = timeline.poseAt(scene.from + 0.8)
    const fromAct = planPoseAt(0.8)
    expect(fromTimeline.rotateX).toBeCloseTo(fromAct.rotateX, 9)
    expect(fromTimeline.rotateY).toBeCloseTo(fromAct.rotateY, 9)
    expect(timeline.poseAt(scene.from + duration / 2)).toEqual(REST)
    expect(timeline.poseAt(scene.to - 1e-3)).toEqual(REST)
  })

  test("ends straight so the question opens on the same pose", () => {
    const { duration } = plan()
    expect(planPoseAt(duration)).toEqual(REST)
    expect(planPoseAt(duration)).toEqual(newSessionPoseAt())
  })
})
