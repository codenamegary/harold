import { describe, expect, test } from "bun:test"
import { readFileSync } from "node:fs"
import { REST } from "./body"
import {
  BUILD_FRAMING,
  BUILD_LIGHT,
  buildCameraAt,
  buildLightAt,
  buildPoseAt,
} from "./build"
import { PRESETS } from "./camera"
import { LIGHTS, lightAt } from "./stage"
import { markAt } from "./capture"
import { FPS, activeClip, buildTimeline, type CaptureSlice } from "./timeline"

const capture = JSON.parse(
  readFileSync(new URL("../public/capture.json", import.meta.url), "utf8"),
) as { width: number; height: number; slices: CaptureSlice[] }

const build = () => {
  const timeline = buildTimeline(capture.slices)
  const scene = timeline.scenes.find((entry) => entry.slug === "build")
  if (scene === undefined) {
    throw new Error("the cut has no build scene")
  }
  return { timeline, scene, duration: scene.to - scene.from }
}

describe("build / the handoff from question", () => {
  test("starts on the full framing and work pool question ends on", () => {
    const { timeline, scene } = build()
    expect(buildCameraAt()).toEqual(PRESETS.full)
    expect(buildCameraAt()).toEqual(timeline.cameraAt(scene.from + 1e-3))
    expect(BUILD_LIGHT).toEqual({ state: "work", shape: LIGHTS.work })
    expect(buildLightAt()).toEqual(lightAt(timeline.lights, scene.from + 1e-3))
  })

  test("the handset is already straight on the cut", () => {
    const { timeline, scene } = build()
    expect(buildPoseAt()).toEqual(REST)
    expect(buildPoseAt()).toEqual(timeline.poseAt(scene.from + 1e-3))
  })
})

describe("build / camera", () => {
  test("holds the full framing for the whole act", () => {
    const { timeline, scene } = build()
    expect(BUILD_FRAMING).toEqual(PRESETS.full)
    expect(buildCameraAt().scale).toBe(1)
    expect(buildCameraAt().focus).toEqual({ x: 0.5, y: 0.5 })
    expect(buildCameraAt().dock).toBe(0.5)
    expect(timeline.cameraAt(scene.from + 1e-3)).toEqual(PRESETS.full)
    expect(timeline.cameraAt(scene.to - 1e-3)).toEqual(PRESETS.full)
  })
})

describe("build / light", () => {
  test("holds the work pool for the whole act", () => {
    const { timeline, scene } = build()
    expect(buildLightAt()).toEqual({ state: "work", shape: LIGHTS.work })
    expect(lightAt(timeline.lights, scene.from + 1e-3)).toEqual({
      state: "work",
      shape: LIGHTS.work,
    })
    expect(lightAt(timeline.lights, scene.to - 1e-3)).toEqual({
      state: "work",
      shape: LIGHTS.work,
    })
  })
})

describe("build / body", () => {
  test("holds the handset straight while the build runs", () => {
    const { timeline, scene, duration } = build()
    expect(buildPoseAt()).toEqual(REST)
    expect(timeline.poseAt(scene.from + 1e-3)).toEqual(REST)
    expect(timeline.poseAt(scene.from + duration / 2)).toEqual(REST)
    expect(timeline.poseAt(scene.to - 1e-3)).toEqual(REST)
  })
})

describe("build / hold", () => {
  test("shows the caption and mode tap, waits two seconds, then compresses the typing", () => {
    const { timeline, scene, duration } = build()
    const slice = capture.slices.find((entry) => entry.name === "build")
    if (slice === undefined) {
      throw new Error("capture.json has no build slice")
    }
    const startSec = markAt("build", "build_ready")
    const modeSec = markAt("build", "mode_build")
    const typedSec = markAt("build", "keys_done")
    const shots = timeline.shots.filter((shot) => shot.scene === "build")
    expect(shots).toHaveLength(4)
    expect(shots[0]?.startSec).toBeCloseTo(startSec, 9)
    expect(shots[0]?.rate).toBe(1)
    expect(shots[0]?.duration).toBeCloseTo(modeSec - startSec, 6)
    expect(shots[1]?.hold).toBe(true)
    expect(shots[1]?.startSec).toBeCloseTo(modeSec, 9)
    const hold = shots[1]
    expect(hold === undefined ? 0 : hold.until - hold.at).toBeCloseTo(2, 6)
    expect(shots[2]?.startSec).toBeCloseTo(modeSec, 9)
    expect(shots[2]?.rate).toBe(4)
    expect(shots[3]?.startSec).toBeCloseTo(typedSec, 9)
    expect(shots[3]?.rate).toBe(1)
    // Faster than the raw slice because the typing is compressed, but still long
    // enough to hold on the reply.
    const rawFrames = Math.max(1, Math.ceil((slice.durationSec - startSec) * FPS - 1e-4))
    expect(scene.frames).toBeLessThan(rawFrames)
    expect(duration).toBeCloseTo(scene.frames / FPS, 9)
    const first = activeClip(timeline.clips, scene.from)
    const last = activeClip(timeline.clips, scene.to - 1e-3)
    expect(first?.file).toBe(slice.file)
    expect(first?.kind).toBe("play")
    expect(last?.file).toBe(slice.file)
  })
})
