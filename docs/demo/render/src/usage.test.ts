import { describe, expect, test } from "bun:test"
import { readFileSync } from "node:fs"
import { REST } from "./body"
import { CAMERA_EASE_SEC, PRESETS, focusPoint, phoneLayout } from "./camera"
import { LIGHTS, lightAt } from "./stage"
import { buildTimeline, type CaptureSlice } from "./timeline"
import {
  USAGE_FRAMING,
  USAGE_HANDOFF,
  USAGE_HANDOFF_LIGHT,
  USAGE_TRANSITION_POSE,
  USAGE_WIDE_LIGHT,
  usageCameraAt,
  usageLightAt,
  usagePoseAt,
} from "./usage"

const capture = JSON.parse(
  readFileSync(new URL("../public/capture.json", import.meta.url), "utf8"),
) as { width: number; height: number; slices: CaptureSlice[] }

const STAGE_W = 1920
const STAGE_H = 1080
const NO_DRIFT = { x: 0, y: 0 }

const usage = () => {
  const timeline = buildTimeline(capture.slices)
  const scene = timeline.scenes.find((entry) => entry.slug === "usage")
  if (scene === undefined) {
    throw new Error("the cut has no usage scene")
  }
  return { timeline, scene, duration: scene.to - scene.from }
}

describe("usage / the handoff from the build", () => {
  test("starts on the full handset the build ends on", () => {
    const { timeline, scene } = usage()
    expect(USAGE_HANDOFF).toEqual(PRESETS.full)
    expect(usageCameraAt(0)).toEqual(PRESETS.full)
    expect(usageCameraAt(-CAMERA_EASE_SEC)).toEqual(PRESETS.full)
    expect(timeline.cameraAt(scene.from - 1e-6)).toEqual(PRESETS.full)
  })
})

describe("usage / camera", () => {
  test("honours the script's header framing exactly", () => {
    expect(USAGE_FRAMING).toEqual({
      preset: "upper-center",
      scale: 2.2,
      focus: { x: 0.5, y: 0.08 },
      dock: 0.5,
    })
    expect(USAGE_FRAMING.scale).toBeGreaterThan(PRESETS["upper-center"].scale)
    expect(USAGE_FRAMING.focus.y).toBeLessThan(PRESETS["upper-center"].focus.y)
  })

  test("pushes in from the handoff, then holds to the end", () => {
    const { duration } = usage()
    expect(duration).toBeGreaterThan(CAMERA_EASE_SEC)
    const middle = usageCameraAt(CAMERA_EASE_SEC * 0.45)
    expect(middle.scale).toBeGreaterThan(PRESETS.full.scale)
    expect(middle.scale).toBeLessThan(USAGE_FRAMING.scale)
    expect(middle.focus.y).toBeGreaterThan(USAGE_FRAMING.focus.y)
    expect(middle.focus.y).toBeLessThan(PRESETS.full.focus.y)
    expect(middle.preset).toBe("upper-center")
    const settled = usageCameraAt(CAMERA_EASE_SEC)
    expect(settled).toEqual(USAGE_FRAMING)
    expect(
      usageCameraAt(CAMERA_EASE_SEC + (duration - CAMERA_EASE_SEC) / 2),
    ).toEqual(settled)
    expect(usageCameraAt(duration)).toEqual(USAGE_FRAMING)
  })

  test("the header lands high in the frame while the phone fills it", () => {
    const layout = phoneLayout(
      USAGE_FRAMING,
      capture.width,
      capture.height,
      STAGE_W,
      STAGE_H,
      NO_DRIFT,
    )
    const point = focusPoint(layout, USAGE_FRAMING)
    expect(layout.height).toBeGreaterThan(STAGE_H)
    expect(layout.top).toBe(0)
    expect(point.x).toBeCloseTo(STAGE_W / 2, 6)
    expect(point.y).toBeLessThan(STAGE_H / 4)
  })
})

describe("usage / light", () => {
  test("opens on the work pool the build ends on", () => {
    expect(USAGE_HANDOFF_LIGHT).toEqual({ state: "work", shape: LIGHTS.work })
    expect(usageLightAt(0)).toEqual(USAGE_HANDOFF_LIGHT)
    expect(usageLightAt(0).state).toBe("work")
  })

  test("opens out with the push-in and floods the close-up", () => {
    const { timeline, scene, duration } = usage()
    const middle = usageLightAt(CAMERA_EASE_SEC / 2)
    expect(middle.state).toBe("work")
    expect(middle.shape.radiusX).toBeGreaterThan(LIGHTS.work.radiusX)
    expect(middle.shape.radiusX).toBeLessThan(USAGE_WIDE_LIGHT.radiusX)
    expect(usageLightAt(CAMERA_EASE_SEC)).toEqual({
      state: "work",
      shape: USAGE_WIDE_LIGHT,
    })
    expect(usageLightAt(CAMERA_EASE_SEC + (duration - CAMERA_EASE_SEC) / 2)).toEqual({
      state: "work",
      shape: USAGE_WIDE_LIGHT,
    })
    expect(usageLightAt(duration)).toEqual({ state: "work", shape: USAGE_WIDE_LIGHT })
    expect(usageLightAt(0).state).toBe(lightAt(timeline.lights, scene.from).state)
  })
})

describe("usage / body", () => {
  test("tilts only during the push-in, then holds straight", () => {
    const { timeline, scene, duration } = usage()
    const peak = CAMERA_EASE_SEC / 2
    expect(usagePoseAt(0)).toEqual(REST)
    expect(usagePoseAt(peak)).toEqual(USAGE_TRANSITION_POSE)
    expect(usagePoseAt(peak).rotateX).toBeLessThan(0)
    expect(usagePoseAt(CAMERA_EASE_SEC)).toEqual(REST)
    for (const sec of [CAMERA_EASE_SEC, duration / 2, duration]) {
      expect(usagePoseAt(sec)).toEqual(REST)
    }
    expect(timeline.poseAt(scene.from)).toEqual(REST)
    expect(timeline.poseAt(scene.from + peak)).toEqual(USAGE_TRANSITION_POSE)
    expect(timeline.poseAt(scene.from + CAMERA_EASE_SEC)).toEqual(REST)
    expect(timeline.poseAt(scene.to - 1e-3)).toEqual(REST)
  })
})
