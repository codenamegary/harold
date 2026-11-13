import { describe, expect, test } from "bun:test"
import { readFileSync } from "node:fs"
import { REST } from "./body"
import { CAMERA_EASE_SEC, PRESETS } from "./camera"
import {
  PR_FRAMING,
  PR_HANDOFF_LIGHT,
  prCameraAt,
  prLightAt,
  prPoseAt,
} from "./pr"
import { LIGHTS, LIGHT_FADE_SEC, lightAt } from "./stage"
import { FPS, buildTimeline, type CaptureSlice } from "./timeline"

const capture = JSON.parse(
  readFileSync(new URL("../public/capture.json", import.meta.url), "utf8"),
) as { width: number; height: number; slices: CaptureSlice[] }

const prScene = () => {
  const timeline = buildTimeline(capture.slices)
  const scene = timeline.scenes.find((entry) => entry.slug === "pr")
  if (scene === undefined) {
    throw new Error("the cut has no pr scene")
  }
  const worktrees = timeline.scenes.find((entry) => entry.slug === "worktrees")
  if (worktrees === undefined) {
    throw new Error("the cut has no worktrees scene")
  }
  return { timeline, scene, worktrees, duration: scene.to - scene.from }
}

describe("pr / the handoff from worktrees", () => {
  test("starts on the worktrees framing and rest pose", () => {
    const { timeline, scene, worktrees } = prScene()
    expect(PR_FRAMING).toEqual(PRESETS.full)
    expect(prCameraAt()).toEqual(PRESETS.full)
    expect(prCameraAt()).toEqual(timeline.cameraAt(worktrees.to - 1e-6))
    expect(prCameraAt()).toEqual(timeline.cameraAt(scene.from - CAMERA_EASE_SEC))
    expect(prCameraAt()).toEqual(timeline.cameraAt(scene.from))
    expect(prPoseAt()).toEqual(REST)
    expect(prPoseAt()).toEqual(timeline.poseAt(scene.from))
  })

  test("opens on the work pool before the field opens", () => {
    const { timeline, worktrees } = prScene()
    expect(lightAt(timeline.lights, worktrees.to - 1e-6)).toEqual(PR_HANDOFF_LIGHT)
    expect(prLightAt(-LIGHT_FADE_SEC - 1)).toEqual(PR_HANDOFF_LIGHT)
    expect(prLightAt(-LIGHT_FADE_SEC)).toEqual(PR_HANDOFF_LIGHT)
  })
})

describe("pr / camera", () => {
  test("holds the full phone for the whole act", () => {
    const { timeline, scene, duration } = prScene()
    for (const sec of [0, duration / 2, duration]) {
      expect(prCameraAt()).toEqual(PRESETS.full)
      expect(timeline.cameraAt(scene.from + sec)).toEqual(PRESETS.full)
    }
  })
})

describe("pr / light", () => {
  test("fades from the work pool into the wide field", () => {
    const opening = prLightAt(0)
    expect(opening.state).toBe("full")
    expect(opening.shape).toEqual(LIGHTS.work)
    const middle = prLightAt(LIGHT_FADE_SEC / 2)
    expect(middle.state).toBe("full")
    expect(middle.shape).not.toEqual(LIGHTS.work)
    expect(middle.shape).not.toEqual(LIGHTS.full)
    expect(middle.shape.radiusX).toBeGreaterThan(LIGHTS.work.radiusX)
    expect(middle.shape.radiusX).toBeLessThan(LIGHTS.full.radiusX)
    expect(prLightAt(LIGHT_FADE_SEC)).toEqual({ state: "full", shape: LIGHTS.full })
  })

  test("the field holds wide for the rest of the act", () => {
    const { duration } = prScene()
    expect(prLightAt(LIGHT_FADE_SEC + 0.05)).toEqual({ state: "full", shape: LIGHTS.full })
    expect(prLightAt(duration / 2)).toEqual({ state: "full", shape: LIGHTS.full })
    expect(prLightAt(duration)).toEqual({ state: "full", shape: LIGHTS.full })
    expect(LIGHTS.full.radiusX).toBeGreaterThan(LIGHTS.work.radiusX)
    expect(LIGHTS.full.haze).toBeGreaterThan(LIGHTS.work.haze)
    expect(LIGHTS.full.intensity).toBeLessThan(LIGHTS.work.intensity)
  })
})

describe("pr / body", () => {
  test("sits at rest and holds for the whole act", () => {
    const { timeline, scene, duration } = prScene()
    expect(prPoseAt()).toEqual(REST)
    expect(prPoseAt()).toEqual(timeline.poseAt(scene.from + duration / 2))
    expect(prPoseAt()).toEqual(timeline.poseAt(scene.to - 1e-6))
  })
})

describe("pr / timing", () => {
  test("runs for the pr scene's frames", () => {
    const { scene } = prScene()
    expect(scene.frames).toBeGreaterThan(0)
    expect(scene.to - scene.from).toBeCloseTo(scene.frames / FPS, 9)
  })
})
