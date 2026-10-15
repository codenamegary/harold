import type { CaptureEvent } from "./Demo"

// One short line under the phone per step of the walk. Keyed by the marks
// drive_phone.py writes at the moment each action starts, so the copy lands
// when the screen changes. `offset` shifts a caption off its mark, for steps
// the driver only marks at the end.
type StepCopy = { event: string; text: string; offset?: number }

const copy: StepCopy[] = [
  { event: "driver_start", text: "Launch Harold" },
  { event: "tap_pair", text: "Scan the QR code" },
  { event: "paired_chat_visible", text: "Achievement unlocked: Work from Couch" },
  { event: "tap_new_session", text: "Start a new session" },
  { event: "config_visible", text: "Choose a model" },
  { event: "mode_plan", text: "Switch modes" },
  // Marked at the first tap of the effort chip, not when the target is reached.
  { event: "effort_start", text: "Change thinking effort" },
  // Marked when the Message field is tapped; the keyboard opens just after.
  { event: "prompt_start", text: "Send a prompt" },
  { event: "reply_visible", text: "Winning." },
]

export type Step = { text: string; at: number }

export const stepsFrom = (events: readonly CaptureEvent[]): Step[] =>
  copy
    .flatMap((step) => {
      const event = events.find((candidate) => candidate.name === step.event)
      return event === undefined ? [] : [{ text: step.text, at: event.sec + (step.offset ?? 0) }]
    })
    .sort((a, b) => a.at - b.at)
