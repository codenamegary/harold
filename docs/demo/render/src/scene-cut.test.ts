import { describe, expect, test } from "bun:test"
import {
  achievementCameraAt,
  achievementLightAt,
} from "./achievement"
import { ACHIEVEMENT_CUT, ACHIEVEMENT_DURATION } from "./achievement.cut"
import { CAPTURE, markAt } from "./capture"
import {
  INTRO_SEC,
  SSH_CARD_HOLD_SEC,
  SSH_CARD_SEC,
  SSH_HOME_HOLD_SEC,
  openingCameraAt,
  openingLightAt,
} from "./opening"
import { OPENING_CUT, OPENING_DURATION } from "./opening.cut"
import { FPS, buildTimeline } from "./timeline"

const frame = {
  stageWidth: 1920,
  stageHeight: 1080,
  videoWidth: CAPTURE.width,
  videoHeight: CAPTURE.height,
}

describe("scene cuts / opening", () => {
  test("starts with the intro lead-in, then the empty home hold", () => {
    const first = OPENING_CUT.clips[0]
    expect(first?.kind).toBe("hold")
    expect(first?.file).toBe("slices/001-home_empty.mp4")
    expect(first?.from).toBeCloseTo(INTRO_SEC, 9)
    expect(first?.duration).toBeCloseTo(SSH_HOME_HOLD_SEC, 9)
  })

  test("keeps the legacy opening length while the master still uses the global timeline", () => {
    const timeline = buildTimeline(CAPTURE.slices)
    const ssh = timeline.scenes.find((scene) => scene.slug === "ssh")
    expect(ssh).toBeDefined()
    expect(OPENING_DURATION).toBe(Math.round((ssh?.to ?? 0) * FPS))
  })

  test("the camera hands off to the achievement", () => {
    expect(openingCameraAt(OPENING_DURATION / FPS)).toEqual(achievementCameraAt(0))
  })

  test("the light shape hands off to the achievement", () => {
    expect(openingLightAt(OPENING_DURATION / FPS, frame).shape).toEqual(
      achievementLightAt(0).shape,
    )
  })

  test("the card is local to the opening", () => {
    expect(OPENING_CUT.copy).toEqual([
      {
        kind: "card",
        at: INTRO_SEC + SSH_CARD_SEC,
        hold: SSH_CARD_HOLD_SEC,
        title: "Look what I can do!",
        place: "stage",
      },
    ])
  })
})

describe("scene cuts / achievement", () => {
  test("starts on the landing home screen, not the SSH form", () => {
    const first = ACHIEVEMENT_CUT.clips[0]
    if (first?.kind !== "play") {
      throw new Error("the achievement must start on a playing landing clip")
    }
    expect(first.file).toBe("slices/003-landing.mp4")
    expect(first.from).toBe(0)
    expect(first.startSec).toBeCloseTo(markAt("landing", "chat_visible"), 9)
  })

  test("keeps the legacy achievement length while the master still uses the global timeline", () => {
    const timeline = buildTimeline(CAPTURE.slices)
    const achievement = timeline.scenes.find((scene) => scene.slug === "achievement")
    if (achievement === undefined) {
      throw new Error("the global timeline has no achievement scene")
    }
    expect(ACHIEVEMENT_DURATION).toBe(achievement.frames)
    expect(achievement.from).toBeCloseTo(OPENING_DURATION / FPS, 9)
  })

  test("the scenes after the achievement start at the local cut boundary", () => {
    const timeline = buildTimeline(CAPTURE.slices)
    const newSession = timeline.scenes.find((scene) => scene.slug === "newSession")
    if (newSession === undefined) {
      throw new Error("the global timeline has no newSession scene")
    }
    expect(newSession.from).toBeCloseTo((OPENING_DURATION + ACHIEVEMENT_DURATION) / FPS, 9)
  })

  test("owns the only celebration and confetti", () => {
    expect(ACHIEVEMENT_CUT.celebrations).toHaveLength(1)
    expect(ACHIEVEMENT_CUT.confetti).toHaveLength(1)
    expect(ACHIEVEMENT_CUT.confetti[0]?.at).toBe(0.7)
    expect(ACHIEVEMENT_CUT.confetti[0]?.count).toBe(96)
  })
})
