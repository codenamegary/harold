import { Easing } from "remotion"
import { pairSegs, statusSegs, type TermItem } from "./terminal-data"

export type CaptureEvent = { name: string; sec: number }

export type DemoProps = {
  events: CaptureEvent[]
  videoWidth: number
  videoHeight: number
  captureSec: number
}

export const FPS = 30
export const INTRO_SEC = 3.4
export const OUTRO_SEC = 4.2

// --- Master clock -----------------------------------------------------------
//
// Scene 1 is the terminal, zoomed in close: it types `harold start` and
// prints the server status, fixed in place the whole time. When the pairing
// flow starts the terminal zooms out to sit fully in frame on the left - and
// never moves again until pairing is done - while the phone slides in to the
// right of it. The QR prints, the phone taps Pair, the camera scans, the
// device pairs. Only then does the terminal slide out and the phone take
// center stage for the rest of the walk.
//
// Two short holds give the captions room to breathe (before the Pair tap and
// before the session dropdown tap) and one 3x sprint skips the scanner
// warm-up so the camera scene reads in about three seconds. Everything else
// is 1:1, so capture marks map linearly (render = capture + 12.1).
//
//   render  8.8 - 11.7    phone slides in, capture plays 0 -> 2.9
//   render 11.7 - 14.2    hold on "Not paired"     [CAP] Pair with your agents
//   render 14.2 - 15.1    Pair tap, scanner opens
//   render 15.1 - 16.9    scanner warm-up          (capture 3.8 -> 9.2 at 3x)
//   render 16.9 - 23.05   scan lands, device pairs capture 9.2 -> 15.35
//   render 23.05 - 27.5   hold on paired home      [CAP] Achievement unlocked
//   render 27.5 -> end    capture 15.4 -> end, 1:1

const PHONE_IN_AT = 8.8
const TAP_HOLD_END = 14.2
const SPRINT_END = 16.9
const PAIRED_HOLD_END = 23.05
const REcede_AT = 22.8
const DROPDOWN_HOLD_END = 27.5
const RESUME_CAPTURE_AT = 15.4
const PAIRED_CAPTURE_AT = 12.7
const SCANNER_WARM_END_CAPTURE_AT = 9.2

type PlaySegment = {
  kind: "play"
  from: number
  to: number
  captureFrom: number
  rate: number
}
type HoldSegment = { kind: "hold"; from: number; to: number; captureAt: number }

const segments: (PlaySegment | HoldSegment)[] = [
  { kind: "play", from: PHONE_IN_AT + 0.6, to: 11.7, captureFrom: 0, rate: 1 },
  { kind: "hold", from: 11.7, to: TAP_HOLD_END, captureAt: 2.9 },
  { kind: "play", from: TAP_HOLD_END, to: 15.1, captureFrom: 2.9, rate: 1 },
  { kind: "play", from: 15.1, to: SPRINT_END, captureFrom: 3.8, rate: 3 },
  {
    kind: "play",
    from: SPRINT_END,
    to: PAIRED_HOLD_END,
    captureFrom: SCANNER_WARM_END_CAPTURE_AT,
    rate: 1,
  },
  { kind: "hold", from: PAIRED_HOLD_END, to: DROPDOWN_HOLD_END, captureAt: 15.35 },
  {
    kind: "play",
    from: DROPDOWN_HOLD_END,
    to: Number.POSITIVE_INFINITY,
    captureFrom: RESUME_CAPTURE_AT,
    rate: 1,
  },
]

/** Capture second shown by the phone at this render second. */
export const captureAt = (sec: number): number => {
  for (const segment of segments) {
    if (sec < segment.to) {
      if (segment.kind === "hold") {
        return segment.captureAt
      }
      return Math.max(
        0,
        segment.captureFrom + (Math.max(sec, segment.from) - segment.from) * segment.rate,
      )
    }
  }
  return RESUME_CAPTURE_AT
}

/** Render second at which the phone shows this capture second. Linear zones only. */
export const renderAt = (captureSec: number): number => {
  for (let index = 0; index < segments.length; index += 1) {
    const segment = segments[index]
    if (segment.kind !== "play" || segment.rate !== 1) {
      continue
    }
    const captureTo =
      segment.captureFrom + ((segments[index + 1]?.from ?? Infinity) - segment.from)
    if (captureSec >= segment.captureFrom && captureSec < captureTo) {
      return segment.from + (captureSec - segment.captureFrom)
    }
  }
  return DROPDOWN_HOLD_END
}

export const captureEndSec = (captureDurationSec: number): number =>
  DROPDOWN_HOLD_END + (captureDurationSec - RESUME_CAPTURE_AT)

export const totalSec = (captureDurationSec: number): number =>
  captureEndSec(captureDurationSec) + OUTRO_SEC

// --- Keyframe channels ------------------------------------------------------

export type Keyframes = [number, number][]

const ease = Easing.bezier(0.16, 1, 0.3, 1)

/** Value of a keyframe channel at `sec`, eased between keyframes, clamped. */
export const channel = (keyframes: Keyframes, sec: number): number => {
  if (sec <= keyframes[0][0]) {
    return keyframes[0][1]
  }
  for (let index = 1; index < keyframes.length; index += 1) {
    const [to, valueTo] = keyframes[index]
    if (sec <= to) {
      const [from, valueFrom] = keyframes[index - 1]
      const progress = (sec - from) / (to - from)
      return valueFrom + (valueTo - valueFrom) * ease(progress)
    }
  }
  return keyframes[keyframes.length - 1][1]
}

// Terminal stage: one fixed box for the whole first act. The close-up is a
// pure scale on that box; after pairing the box slides out to the left.
// The origin sits at the top-left so the close-up keeps the title bar and
// the prompt labels in frame.
export const TERM_BOX = { left: 60, top: 112, width: 920, height: 920 }
export const TERM_ORIGIN = "0% 6%"

export const termScale: Keyframes = [
  [0, 1],
  [3.3, 1],
  [4.0, 2.35],
  [8.8, 2.35],
  [9.8, 1],
]
export const termOpacity: Keyframes = [
  [0, 1],
  [REcede_AT, 1],
  [REcede_AT + 1.8, 0],
]
export const termX: Keyframes = [
  [0, 0],
  [REcede_AT, 0],
  [REcede_AT + 1.8, -1120],
]

// Phone stage channels: joins at the pairing flow, to the right of the fully
// framed terminal, and only takes center stage once pairing is done.
export const phoneWidth: Keyframes = [
  [PHONE_IN_AT, 380],
  [REcede_AT, 380],
  [REcede_AT + 1.8, 450],
]
export const phoneCenterX: Keyframes = [
  [PHONE_IN_AT, 2440],
  [PHONE_IN_AT + 1.7, 1460],
  [REcede_AT, 1460],
  [REcede_AT + 1.8, 960],
]
export const phoneTop: Keyframes = [
  [PHONE_IN_AT, 108],
  [REcede_AT, 108],
  [REcede_AT + 1.8, 30],
]
// The screen starts black and fades the app in as the phone settles.
export const phoneBlack: Keyframes = [
  [PHONE_IN_AT, 1],
  [PHONE_IN_AT + 1.0, 0],
]

// --- Terminal transcript ----------------------------------------------------

const transcript = (pairedRenderSec: number): TermItem[] => {
  const items: TermItem[] = [
    // The prompt sits ready from the first frame; typing starts at typeAt.
    { kind: "command", at: 0, typeAt: 4.6, text: "harold start", cps: 12 },
  ]
  statusSegs.forEach((segs, index) => {
    items.push({ kind: "output", at: 5.95 + index * 0.2, segs })
  })
  items.push({ kind: "command", at: 9.3, text: "harold pair", cps: 10 })
  pairSegs.forEach((segs, index) => {
    items.push({ kind: "output", at: 10.75 + index * 0.2, segs })
  })
  items.push({ kind: "qr", at: 12.0, rowDelay: 0.025 })
  items.push({ kind: "output", at: 13.25, segs: [{ text: "" }] })
  items.push({
    kind: "output",
    at: 13.45,
    segs: [{ text: "Waiting for a device to scan..." }],
  })
  items.push({
    kind: "output",
    at: pairedRenderSec + 0.15,
    segs: [{ text: "Device paired.", color: "lime" }],
  })
  items.push({ kind: "output", at: pairedRenderSec + 0.5, segs: [{ text: "" }] })
  items.push({ kind: "command", at: pairedRenderSec + 0.95, text: "", cps: 1 })
  return items
}

// --- Taps -------------------------------------------------------------------

// Every tap of the recorded walk, from drive_phone.py's log: capture second
// and screen position in capture pixels (1080x2400). All of these sit in 1:1
// zones of the clock above; a re-capture with different pacing means
// re-checking this table against the new marks and frames.
type TapSpec = { at: number; x: number; y: number }

const tapSpecs: TapSpec[] = [
  { at: 3.411, x: 540, y: 2205 }, // Pair
  { at: 15.42, x: 498, y: 211 }, // Select session dropdown
  { at: 23.25, x: 508, y: 491 }, // first recent session row
  { at: 35.3, x: 498, y: 211 }, // Select session dropdown again
  { at: 40.45, x: 530, y: 364 }, // New session
  { at: 42.6, x: 540, y: 507 }, // workspace: sites
  { at: 47.6, x: 126, y: 801 }, // workspace: harold
  { at: 52.6, x: 540, y: 707 }, // agent picker (Cursor row)
  { at: 58.8, x: 159, y: 1001 }, // agent: OpenCode
  { at: 61.4, x: 540, y: 886 }, // Continue
  { at: 69.3, x: 391, y: 1934 }, // Model chip
  { at: 74.2, x: 327, y: 1484 }, // Search models
  { at: 79.2, x: 540, y: 1313 }, // deepseek/DeepSeek V4.1 Flash
  { at: 84.6, x: 620, y: 1934 }, // Mode chip -> Plan
  { at: 86.3, x: 620, y: 1934 }, // Mode chip -> Build
  { at: 92.7, x: 830, y: 1934 }, // Thinking chip
  { at: 94.2, x: 830, y: 1934 },
  { at: 95.7, x: 830, y: 1934 },
  { at: 99.8, x: 176, y: 2074 }, // Message field
  { at: 109.4, x: 274, y: 1391 }, // Attach photo
  { at: 114.3, x: 902, y: 817 }, // third cat photo
  { at: 116.9, x: 922, y: 2242 }, // Add (1)
  { at: 122.6, x: 411, y: 1391 }, // Attach files
  { at: 126.4, x: 299, y: 797 }, // cat-diary.txt
  { at: 133.2, x: 943, y: 1391 }, // Send message
  { at: 156.8, x: 806, y: 2211 }, // Dictate with voice
  { at: 166.3, x: 274, y: 2212 }, // Expand voice input
  { at: 181.2, x: 975, y: 2242 }, // Send (voice)
]

export type Ripple = { at: number; x: number; y: number }

export const rippleDuration = 0.55
export const rippleColor = "#B6F36B"

// --- Keystrokes and captions ------------------------------------------------

const MODEL_SEARCH_TEXT = "deepseek"
const PROMPT_TEXT = "Do you think my cat's behaviour is strange?"

type CaptionSpec = { at: number; hold: number; text: string }

const captionSpecs: CaptionSpec[] = [
  { at: 3.9, hold: 2.6, text: "Start Harold wherever you run your agents" },
  { at: 8.3, hold: 1.6, text: "Generate a secure temporary pairing code" },
  { at: 10.9, hold: 1.4, text: "Harold'ing..." },
  { at: 13.3, hold: 2.2, text: "Pair with your agents" },
  { at: 23.0, hold: 2.6, text: "Achievement Unlocked: Work from Couch" },
  { at: 25.2, hold: 2.4, text: "Access your agent session history" },
  { at: 49.8, hold: 2.4, text: "Start a new session" },
  { at: 78.7, hold: 2.4, text: "Model list from your Agent" },
  { at: 94.0, hold: 2.6, text: "Toggle modes supported by your agent" },
  { at: 102.1, hold: 2.4, text: "Adjust thinking effort" },
  { at: 109.2, hold: 2.6, text: "Send a text Prompt" },
  { at: 118.8, hold: 2.6, text: "Attachments" },
]

export type Caption = CaptionSpec

// --- Sounds -----------------------------------------------------------------

export type SoundName = "key" | "enter" | "tap" | "ping"

export type Sound = { at: number; name: SoundName; volume: number }

// The virtual microphone: capture rewinds voice-input.wav into the emulator
// just before the voice button tap. Played so the words land just after the
// audio, the way real dictation reads.
const VOICE_WAV_AT = 172.1

// --- Timeline ---------------------------------------------------------------

export type Timeline = {
  terminal: TermItem[]
  ripples: Ripple[]
  captions: Caption[]
  sounds: Sound[]
  voiceWavAt: number
  endSec: number
}

/**
 * The whole cut, derived from the capture marks.
 */
export const buildTimeline = (captureDurationSec: number): Timeline => {
  const pairedRenderSec = renderAt(PAIRED_CAPTURE_AT)

  const sounds: Sound[] = []
  // [KR] every keystroke, a separate sound for Enter.
  for (let index = 0; index < 12; index += 1) {
    sounds.push({ at: 4.6 + index / 12, name: "key", volume: 1 })
  }
  sounds.push({ at: 5.62, name: "enter", volume: 1 })
  for (let index = 0; index < 11; index += 1) {
    sounds.push({ at: 9.3 + index / 10, name: "key", volume: 1 })
  }
  sounds.push({ at: 10.44, name: "enter", volume: 1 })
  // [KR] on the phone: the model search, then the drafted prompt.
  for (let index = 0; index < MODEL_SEARCH_TEXT.length; index += 1) {
    sounds.push({ at: renderAt(74.8 + index * 0.14), name: "key", volume: 0.8 })
  }
  const promptStep = 4.8 / PROMPT_TEXT.length
  for (let index = 0; index < PROMPT_TEXT.length; index += 1) {
    sounds.push({ at: renderAt(101.0 + index * promptStep), name: "key", volume: 0.8 })
  }
  // [TAP] one pop per tap, at the tap.
  for (const tap of tapSpecs) {
    sounds.push({ at: renderAt(tap.at), name: "tap", volume: 0.9 })
  }
  // [CAP] a soft ping when a caption appears.
  for (const caption of captionSpecs) {
    sounds.push({ at: caption.at, name: "ping", volume: 0.55 })
  }

  return {
    terminal: transcript(pairedRenderSec),
    ripples: tapSpecs.map((tap) => ({
      at: renderAt(tap.at),
      x: tap.x / 1080,
      y: tap.y / 2400,
    })),
    captions: captionSpecs,
    sounds: sounds.sort((a, b) => a.at - b.at),
    voiceWavAt: VOICE_WAV_AT,
    endSec: captureEndSec(captureDurationSec),
  }
}
