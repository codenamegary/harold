import {
  INTRO_SEC,
  SSH_CARD_HOLD_SEC,
  SSH_CARD_SEC,
  SSH_HOME_HOLD_SEC,
} from "./opening"
import { buildSceneCut } from "./scene-cut"
import type { CopyItem } from "./timeline"

const OPENING_COPY: CopyItem[] = [
  {
    kind: "card",
    at: INTRO_SEC + SSH_CARD_SEC,
    hold: SSH_CARD_HOLD_SEC,
    title: "Look what I can do!",
    place: "stage",
  },
]

/**
 * The opening's own cut. The intro is a lead-in before the phone exists. The
 * SSH beats start after it. Nothing here knows about the achievement.
 */
export const OPENING_CUT = buildSceneCut({
  scene: "ssh",
  leadInSec: INTRO_SEC,
  shots: [
    { slice: "home_empty", holdAtSec: 0.8, holdSec: SSH_HOME_HOLD_SEC },
    { slice: "connect", to: "lastTap" },
  ],
  copy: OPENING_COPY,
})

export const OPENING_DURATION = OPENING_CUT.durationInFrames
