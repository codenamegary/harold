import { describe, expect, test } from "bun:test"
import { readFileSync } from "node:fs"
import { REST } from "./body"
import { CAMERA_EASE_SEC, PRESETS } from "./camera"
import { OUTRO_CAMERA, outroCameraAt, outroLightAt, outroPoseAt } from "./outro"
import { LIGHTS, LIGHT_FADE_SEC } from "./stage"
import { buildTimeline, phoneLayers, type CaptureSlice } from "./timeline"

const capture = JSON.parse(
  readFileSync(new URL("../public/capture.json", import.meta.url), "utf8"),
) as { width: number; height: number; slices: CaptureSlice[] }

const outro = () => {
  const timeline = buildTimeline(capture.slices)
  const scene = timeline.scenes.find((entry) => entry.slug === "outro")
  const pr = timeline.scenes.find((entry) => entry.slug === "pr")
  if (scene === undefined || pr === undefined) {
    throw new Error("the cut has no PR or outro scene")
  }
  return { timeline, scene, pr, duration: scene.to - scene.from }
}

describe("outro / the handoff from the PR", () => {
  test("starts on the PR's full framing and a settled rest pose", () => {
    const { duration } = outro()
    expect(OUTRO_CAMERA).toEqual(PRESETS.full)
    expect(outroCameraAt(-CAMERA_EASE_SEC)).toEqual(PRESETS.full)
    expect(outroCameraAt(0)).toEqual(PRESETS.full)
    expect(outroCameraAt(0)).toEqual(outroCameraAt(duration))
    expect(outroPoseAt()).toEqual(REST)
  })

  test("opens on the full light the PR ends on", () => {
    const { pr } = outro()
    expect(pr.light).toBe("full")
    expect(outroLightAt(-LIGHT_FADE_SEC)).toEqual({
      state: "full",
      shape: LIGHTS.full,
    })
  })
})

describe("outro / camera", () => {
  test("holds the full framing for the whole card", () => {
    const { duration } = outro()
    expect(outroCameraAt(0)).toEqual(PRESETS.full)
    expect(outroCameraAt(duration / 2)).toEqual(PRESETS.full)
    expect(outroCameraAt(duration)).toEqual(PRESETS.full)
  })
})

describe("outro / light", () => {
  test("settles from the full field into the alone pool on the cut", () => {
    expect(outroLightAt(-LIGHT_FADE_SEC)).toEqual({
      state: "full",
      shape: LIGHTS.full,
    })
    const opening = outroLightAt(0)
    expect(opening.state).toBe("alone")
    expect(opening.shape).toEqual(LIGHTS.full)
    const middle = outroLightAt(LIGHT_FADE_SEC / 2)
    expect(middle.state).toBe("alone")
    expect(middle.shape).not.toEqual(LIGHTS.full)
    expect(middle.shape).not.toEqual(LIGHTS.alone)
    expect(outroLightAt(LIGHT_FADE_SEC)).toEqual({
      state: "alone",
      shape: LIGHTS.alone,
    })
  })

  test("holds the alone pool for the rest of the card", () => {
    const { duration } = outro()
    expect(outroLightAt(LIGHT_FADE_SEC + 0.01)).toEqual({
      state: "alone",
      shape: LIGHTS.alone,
    })
    expect(outroLightAt(duration)).toEqual({
      state: "alone",
      shape: LIGHTS.alone,
    })
    expect(outroLightAt(duration + 1)).toEqual({
      state: "alone",
      shape: LIGHTS.alone,
    })
  })
})

describe("outro / body and hold", () => {
  test("holds rest and draws no phone for the whole card", () => {
    const { timeline, scene, duration } = outro()
    expect(outroPoseAt()).toEqual(REST)
    for (const sec of [
      scene.from,
      scene.from + duration / 2,
      scene.to - 1 / 30,
    ]) {
      expect(phoneLayers(timeline.clips, sec)).toEqual([])
    }
  })

  test("runs the script's 150-frame card", () => {
    const { scene, duration } = outro()
    expect(scene.frames).toBe(150)
    expect(duration).toBeCloseTo(5, 9)
  })
})
