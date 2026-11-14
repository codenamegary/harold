import { buildSceneCut } from "./scene-cut"
import type { Celebration, Confetti, CopyItem } from "./timeline"

const ACHIEVEMENT_COPY: CopyItem[] = [
  {
    kind: "spotlight",
    at: 0.4,
    hold: 5.4,
    side: "left",
    kicker: "Achievement unlocked",
    title: "Work from Couch",
  },
]

const ACHIEVEMENT_CELEBRATIONS: Celebration[] = [
  { at: 0.7, hold: 1.5, strength: 1, confetti: false, confettiHold: 0 },
]

const ACHIEVEMENT_CONFETTI: Confetti[] = [{ at: 0.7, hold: 4.6, count: 96 }]

/**
 * The achievement's own cut. It starts on the home screen, plays the landing
 * footage once, then holds the last frame for the rest of the act.
 */
export const ACHIEVEMENT_CUT = buildSceneCut({
  scene: "achievement",
  shots: [{ slice: "landing", from: "chat_visible" }],
  // Keep the act at its cut length so the scenes after it do not move yet.
  tailHoldSec: 125 / 30,
  copy: ACHIEVEMENT_COPY,
  celebrations: ACHIEVEMENT_CELEBRATIONS,
  confetti: ACHIEVEMENT_CONFETTI,
})

export const ACHIEVEMENT_DURATION = ACHIEVEMENT_CUT.durationInFrames
