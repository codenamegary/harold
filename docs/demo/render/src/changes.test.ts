import { describe, expect, test } from "bun:test"
import { readFileSync } from "node:fs"
import { REST } from "./body"
import { CAMERA_EASE_SEC, PRESETS } from "./camera"
import {
  CHANGES_HANDOFF,
  CHANGES_HANDOFF_LIGHT,
  CHANGES_LIGHT,
  CHANGES_TRANSITION_POSE,
  CHANGES_WIDE,
  changesCameraAt,
  changesLightAt,
  changesPoseAt,
} from "./changes"
import { NEW_SESSION_WIDE_LIGHT } from "./newSession"
import { LIGHTS } from "./stage"
import { buildTimeline, type CaptureSlice } from "./timeline"

const capture = JSON.parse(
  readFileSync(new URL("../public/capture.json", import.meta.url), "utf8"),
) as { width: number; height: number; slices: CaptureSlice[] }

const changes = () => {
  const timeline = buildTimeline(capture.slices)
  const scene = timeline.scenes.find((entry) => entry.slug === "changes")
  if (scene === undefined) {
    throw new Error("the cut has no changes scene")
  }
  return { timeline, scene, duration: scene.to - scene.from }
}

describe("changes / the handoff from usage", () => {
  test("starts on the usage header close-up", () => {
    const { timeline, scene } = changes()
    expect(CHANGES_HANDOFF).toEqual({
      preset: "upper-center",
      scale: 2.2,
      focus: { x: 0.5, y: 0.08 },
      dock: 0.5,
    })
    expect(timeline.cameraAt(scene.from - 0.001)).toEqual(CHANGES_HANDOFF)
    expect(changesCameraAt(0)).toEqual(CHANGES_HANDOFF)
    expect(changesCameraAt(-CAMERA_EASE_SEC)).toEqual(CHANGES_HANDOFF)
  })

  test("opens on the close-up light usage ends with", () => {
    expect(CHANGES_HANDOFF_LIGHT).toEqual({
      state: "work",
      shape: NEW_SESSION_WIDE_LIGHT,
    })
    expect(changesLightAt(0)).toEqual(CHANGES_HANDOFF_LIGHT)
  })
})

describe("changes / camera", () => {
  test("pulls back from the header close-up to the full phone", () => {
    const { duration } = changes()
    expect(CHANGES_WIDE).toEqual(PRESETS.full)
    const middle = changesCameraAt(CAMERA_EASE_SEC / 2)
    expect(middle.scale).toBeLessThan(CHANGES_HANDOFF.scale)
    expect(middle.scale).toBeGreaterThan(CHANGES_WIDE.scale)
    expect(middle.focus.y).toBeGreaterThan(CHANGES_HANDOFF.focus.y)
    expect(middle.focus.y).toBeLessThan(CHANGES_WIDE.focus.y)
    expect(changesCameraAt(CAMERA_EASE_SEC)).toEqual(CHANGES_WIDE)
    expect(changesCameraAt(duration)).toEqual(CHANGES_WIDE)
  })

  test("the full framing holds to the cut", () => {
    const { duration } = changes()
    expect(duration).toBeGreaterThan(CAMERA_EASE_SEC)
    expect(changesCameraAt(CAMERA_EASE_SEC + 0.4)).toEqual(PRESETS.full)
    expect(changesCameraAt(duration - 0.4)).toEqual(PRESETS.full)
    expect(changesCameraAt(duration)).toEqual(PRESETS.full)
  })
})

describe("changes / light", () => {
  test("pulls the flood back into the work pool", () => {
    const { duration } = changes()
    const middle = changesLightAt(CAMERA_EASE_SEC / 2)
    expect(middle.state).toBe("work")
    expect(middle.shape.radiusX).toBeLessThan(CHANGES_HANDOFF_LIGHT.shape.radiusX)
    expect(middle.shape.radiusX).toBeGreaterThan(LIGHTS.work.radiusX)
    expect(changesLightAt(CAMERA_EASE_SEC)).toEqual(CHANGES_LIGHT)
    expect(changesLightAt(duration)).toEqual(CHANGES_LIGHT)
  })

  test("holds the work pool at the phone's feet", () => {
    const { duration } = changes()
    expect(CHANGES_LIGHT).toEqual({ state: "work", shape: LIGHTS.work })
    expect(changesLightAt(duration / 2)).toEqual(CHANGES_LIGHT)
  })
})

describe("changes / body", () => {
  test("turns only during the pull-back, then holds straight", () => {
    const { timeline, scene, duration } = changes()
    const peak = CAMERA_EASE_SEC / 2
    expect(changesPoseAt(0)).toEqual(REST)
    expect(changesPoseAt(peak)).toEqual(CHANGES_TRANSITION_POSE)
    expect(changesPoseAt(peak).rotateY).toBeLessThan(0)
    expect(changesPoseAt(CAMERA_EASE_SEC)).toEqual(REST)
    for (const sec of [CAMERA_EASE_SEC, duration / 2, duration]) {
      expect(changesPoseAt(sec)).toEqual(REST)
    }
    expect(timeline.poseAt(scene.from)).toEqual(REST)
    expect(timeline.poseAt(scene.from + peak)).toEqual(CHANGES_TRANSITION_POSE)
    expect(timeline.poseAt(scene.from + CAMERA_EASE_SEC)).toEqual(REST)
    expect(timeline.poseAt(scene.to - 1e-3)).toEqual(REST)
  })
})
