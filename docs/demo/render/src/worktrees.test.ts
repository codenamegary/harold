import { describe, expect, test } from "bun:test"
import { readFileSync } from "node:fs"
import { REST } from "./body"
import { PRESETS } from "./camera"
import { LIGHTS, lightAt } from "./stage"
import { buildTimeline, type CaptureSlice } from "./timeline"
import {
  WORKTREES_FRAMING,
  WORKTREES_LIGHT,
  WORKTREES_POSE,
  worktreesCameraAt,
  worktreesLightAt,
  worktreesPoseAt,
} from "./worktrees"

const capture = JSON.parse(
  readFileSync(new URL("../public/capture.json", import.meta.url), "utf8"),
) as { width: number; height: number; slices: CaptureSlice[] }

const worktrees = () => {
  const timeline = buildTimeline(capture.slices)
  const scene = timeline.scenes.find((entry) => entry.slug === "worktrees")
  const changes = timeline.scenes.find((entry) => entry.slug === "changes")
  if (scene === undefined || changes === undefined) {
    throw new Error("the cut has no worktrees scene")
  }
  return { timeline, scene, changes, duration: scene.to - scene.from }
}

describe("worktrees / the handoff from changes", () => {
  test("opens on the full framing changes ends on", () => {
    const { timeline, scene, changes } = worktrees()
    expect(changes.to).toBeCloseTo(scene.from, 9)
    expect(WORKTREES_FRAMING).toEqual(PRESETS.full)
    expect(worktreesCameraAt()).toEqual(PRESETS.full)
    expect(timeline.cameraAt(changes.to)).toEqual(PRESETS.full)
    expect(timeline.cameraAt(scene.from)).toEqual(PRESETS.full)
  })

  test("keeps the straight pose changes ends on", () => {
    const { timeline, scene } = worktrees()
    expect(WORKTREES_POSE).toEqual(REST)
    expect(worktreesPoseAt()).toEqual(REST)
    expect(worktreesPoseAt()).toEqual(timeline.poseAt(scene.from))
  })
})

describe("worktrees / camera", () => {
  test("holds the full framing for the whole act", () => {
    const { timeline, scene, duration } = worktrees()
    expect(duration).toBeGreaterThan(0)
    expect(timeline.cameraAt(scene.from + duration / 2)).toEqual(PRESETS.full)
    expect(timeline.cameraAt(scene.to - 1e-3)).toEqual(PRESETS.full)
  })
})

describe("worktrees / light", () => {
  test("holds the working pool from the cut to the end", () => {
    const { timeline, scene } = worktrees()
    expect(WORKTREES_LIGHT).toEqual({ state: "work", shape: LIGHTS.work })
    expect(worktreesLightAt()).toEqual(WORKTREES_LIGHT)
    expect(lightAt(timeline.lights, scene.from)).toEqual({
      state: "work",
      shape: LIGHTS.work,
    })
    expect(lightAt(timeline.lights, scene.to - 1e-3)).toEqual({
      state: "work",
      shape: LIGHTS.work,
    })
  })
})

describe("worktrees / body", () => {
  test("holds the handset straight for the whole act", () => {
    const { timeline, scene, duration } = worktrees()
    expect(worktreesPoseAt()).toEqual(REST)
    for (const sec of [scene.from, scene.from + duration / 2, scene.to - 1e-3]) {
      expect(timeline.poseAt(sec)).toEqual(REST)
    }
  })
})
