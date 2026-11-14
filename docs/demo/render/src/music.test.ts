import { describe, expect, test } from "bun:test"
import { musicVolumeAt } from "./music"
import { MUSIC_VOLUME } from "./timeline"

const FPS = 30

describe("music / the volume envelope", () => {
  test("fades in, holds, and fades out on the full film", () => {
    const duration = 5548
    expect(musicVolumeAt(0, FPS, duration)).toBe(0)
    expect(musicVolumeAt(0.8 * FPS, FPS, duration)).toBeCloseTo(MUSIC_VOLUME, 9)
    expect(musicVolumeAt(3000, FPS, duration)).toBeCloseTo(MUSIC_VOLUME, 9)
    expect(musicVolumeAt(duration - 0.4 * FPS, FPS, duration)).toBeCloseTo(0, 9)
  })

  test("keeps the keyframes ordered on a short preview", () => {
    // The worktrees act is 107 frames, shorter than the 3.8s fade window.
    const duration = 107
    expect(musicVolumeAt(0, FPS, duration)).toBe(0)
    expect(musicVolumeAt(0.8 * FPS, FPS, duration)).toBeCloseTo(MUSIC_VOLUME, 9)
    expect(musicVolumeAt(duration - 0.4 * FPS, FPS, duration)).toBeCloseTo(0, 9)
    expect(musicVolumeAt(0, FPS, 1)).toBe(0)
    expect(musicVolumeAt(1, FPS, 2)).toBeGreaterThanOrEqual(0)
  })
})
