import { describe, expect, test } from "bun:test"
import { readFileSync } from "node:fs"
import { REST } from "./body"
import { PRESETS } from "./camera"
import {
  QUESTION_FRAMING,
  QUESTION_LIGHT,
  questionCameraAt,
  questionLightAt,
  questionPoseAt,
} from "./question"
import { LIGHTS, lightAt } from "./stage"
import { buildTimeline, type CaptureSlice } from "./timeline"

const capture = JSON.parse(
  readFileSync(new URL("../public/capture.json", import.meta.url), "utf8"),
) as { width: number; height: number; slices: CaptureSlice[] }

const question = () => {
  const timeline = buildTimeline(capture.slices)
  const scene = timeline.scenes.find((entry) => entry.slug === "question")
  const plan = timeline.scenes.find((entry) => entry.slug === "plan")
  if (scene === undefined || plan === undefined) {
    throw new Error("the cut has no question scene")
  }
  return { timeline, scene, plan, duration: scene.to - scene.from }
}

describe("question / the handoff from plan", () => {
  test("starts where plan ends: full framing, work pool, straight pose", () => {
    const { timeline, scene, plan, duration } = question()
    expect(plan.to).toBeCloseTo(scene.from, 9)
    expect(QUESTION_FRAMING).toEqual(PRESETS.full)
    expect(questionCameraAt()).toEqual(PRESETS.full)
    expect(questionLightAt()).toEqual({ state: "work", shape: LIGHTS.work })
    expect(questionLightAt()).toEqual(QUESTION_LIGHT)
    expect(questionPoseAt()).toEqual(REST)
    expect(timeline.cameraAt(scene.from)).toEqual(PRESETS.full)
    expect(lightAt(timeline.lights, scene.from)).toEqual({
      state: "work",
      shape: LIGHTS.work,
    })
    expect(timeline.poseAt(scene.from)).toEqual(REST)
    expect(timeline.poseAt(scene.from + duration / 2)).toEqual(REST)
  })
})

describe("question / camera and light", () => {
  test("holds the full framing and the work pool for the whole act", () => {
    const { timeline, scene, duration } = question()
    for (const offset of [0, duration / 2, duration]) {
      expect(questionCameraAt()).toEqual(PRESETS.full)
      expect(questionLightAt()).toEqual({ state: "work", shape: LIGHTS.work })
      expect(timeline.cameraAt(scene.from + offset)).toEqual(PRESETS.full)
    }
    expect(lightAt(timeline.lights, scene.from + duration / 2)).toEqual({
      state: "work",
      shape: LIGHTS.work,
    })
  })
})

describe("question / body", () => {
  test("holds the handset straight while the question is answered", () => {
    const { timeline, scene, duration } = question()
    expect(questionPoseAt()).toEqual(REST)
    for (const sec of [scene.from, scene.from + duration / 2, scene.to - 1e-3]) {
      expect(timeline.poseAt(sec)).toEqual(REST)
    }
  })
})
