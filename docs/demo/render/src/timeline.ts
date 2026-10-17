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
// Scene 1 is the terminal alone, zoomed in close: it types `harold start`,
// prints the server status, then `harold pair` and the QR. The phone then
// slides in and plays the capture from its own second zero. Two holds give
// the captions room to breathe (before the Pair tap and before the session
// dropdown tap) and one 3x sprint skips the scanner warm-up so the camera
// scene reads in about three seconds. Once the phone has settled after the
// last hold, one second of capture is one second of video, so capture marks
// map linearly (render = capture + 19.5).
//
//   render 16.3 - 19.2    phone slides in, capture plays 0 -> 2.9
//   render 19.2 - 21.6    hold on "Not paired"     [CAP] Pair with your agents
//   render 21.6 - 22.5    Pair tap, scanner opens
//   render 22.5 - 24.3    scanner warm-up          (capture 3.8 -> 9.2 at 3x)
//   render 24.3 - 30.45   scan lands, split scene  capture 9.2 -> 15.35
//   render 30.45 - 34.9   hold on paired home      [CAP] Achievement unlocked
//   render 34.9 -> end    capture 15.4 -> end, 1:1

const PHONE_IN_AT = 16.3
const TAP_HOLD_END = 21.6
const SPRINT_END = 24.3
const SPLIT_END = 30.45
const DROPDOWN_HOLD_END = 34.9
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
  { kind: "play", from: PHONE_IN_AT, to: 19.2, captureFrom: 0, rate: 1 },
  { kind: "hold", from: 19.2, to: TAP_HOLD_END, captureAt: 2.9 },
  { kind: "play", from: TAP_HOLD_END, to: 22.5, captureFrom: 2.9, rate: 1 },
  { kind: "play", from: 22.5, to: SPRINT_END, captureFrom: 3.8, rate: 3 },
  {
    kind: "play",
    from: SPRINT_END,
    to: SPLIT_END,
    captureFrom: SCANNER_WARM_END_CAPTURE_AT,
    rate: 1,
  },
  { kind: "hold", from: SPLIT_END, to: DROPDOWN_HOLD_END, captureAt: 15.35 },
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

// Terminal stage channels. The scene 1 close-up zooms the whole box (very
// close on the prompt); the split scene instead grows the box onto the left
// half and zooms the transcript content onto its last lines.
export const termScale: Keyframes = [
  [0, 1],
  [3.3, 1],
  [4.0, 2.35],
  [5.7, 2.35],
  [6.25, 1],
  [15.6, 1],
  [17.4, 0.42],
  [22.1, 0.42],
  [23.3, 1],
  [30.5, 1],
  [32.3, 0.42],
]
export const termOpacity: Keyframes = [
  [0, 1],
  [15.6, 1],
  [17.4, 0.16],
  [22.1, 0.16],
  [23.3, 1],
  [30.5, 1],
  [32.3, 0.16],
]
export const termX: Keyframes = [
  [0, 0],
  [15.6, 0],
  [17.4, -780],
  [22.1, -780],
  [23.3, 0],
  [30.5, 0],
  [32.3, -780],
]
export const termLeft: Keyframes = [
  [0, 80],
  [23.3, -60],
  [30.5, -60],
  [32.3, 80],
]
export const termTop: Keyframes = [
  [0, 148],
  [23.3, 120],
  [30.5, 120],
  [32.3, 148],
]
export const termWidth: Keyframes = [
  [0, 1100],
  [23.3, 900],
  [30.5, 900],
  [32.3, 1100],
]
export const termHeight: Keyframes = [
  [0, 852],
  [23.3, 840],
  [30.5, 840],
  [32.3, 852],
]
// Transcript zoom: 1 everywhere except the split scene, where the content
// pins to its bottom edge and the camera-facing lines fill the frame.
export const termContentZoom: Keyframes = [
  [0, 1],
  [22.1, 1],
  [23.3, 1.55],
  [27.9, 1.55],
  [29.3, 1],
]

// Phone stage channels: center stage for scene 2, the right half of the
// split while the camera pairs, then center again for the rest of the walk.
export const phoneWidth: Keyframes = [
  [PHONE_IN_AT, 450],
  [22.2, 450],
  [23.4, 400],
  [30.5, 400],
  [32.3, 450],
]
export const phoneCenterX: Keyframes = [
  [PHONE_IN_AT, 2440],
  [18.0, 960],
  [22.2, 960],
  [23.4, 1245],
  [30.5, 1245],
  [32.3, 960],
]
export const phoneTop: Keyframes = [
  [PHONE_IN_AT, 30],
  [22.2, 30],
  [23.4, 85],
  [30.5, 85],
  [32.3, 30],
]
// The screen starts black and fades the app in as the phone settles.
export const phoneBlack: Keyframes = [
  [PHONE_IN_AT, 1],
  [PHONE_IN_AT + 0.9, 0],
]

// --- Terminal transcript ----------------------------------------------------

const transcript = (pairedRenderSec: number): TermItem[] => {
  const items: TermItem[] = [
    // Bare prompt with a blinking caret from the first frame.
    { kind: "command", at: 0, text: "", cps: 1 },
    { kind: "command", at: 4.6, text: "harold start", cps: 12 },
  ]
  statusSegs.forEach((segs, index) => {
    items.push({ kind: "output", at: 5.95 + index * 0.2, segs })
  })
  items.push({ kind: "command", at: 9.4, text: "harold pair", cps: 10 })
  pairSegs.forEach((segs, index) => {
    items.push({ kind: "output", at: 10.85 + index * 0.2, segs })
  })
  items.push({ kind: "qr", at: 12.1, rowDelay: 0.045 })
  items.push({ kind: "output", at: 13.55, segs: [{ text: "" }] })
  items.push({
    kind: "output",
    at: 13.75,
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
  { at: 8.7, hold: 2.4, text: "Generate a secure temporary pairing code" },
  { at: 15.6, hold: 1.6, text: "Harold'ing..." },
  { at: 18.4, hold: 2.4, text: "Pair with your agents" },
  { at: 30.7, hold: 2.6, text: "Achievement Unlocked: Work from Couch" },
  { at: 34.2, hold: 2.4, text: "Access your agent session history" },
  { at: 57.2, hold: 2.4, text: "Start a new session" },
  { at: 86.4, hold: 2.4, text: "Model list from your Agent" },
  { at: 102.8, hold: 2.6, text: "Toggle modes supported by your agent" },
  { at: 110.9, hold: 2.4, text: "Adjust thinking effort" },
  { at: 117.3, hold: 2.6, text: "Send a text Prompt" },
  { at: 127.6, hold: 2.6, text: "Attachments" },
]

export type Caption = CaptionSpec

// --- Sounds -----------------------------------------------------------------

export type SoundName = "key" | "enter" | "tap" | "ping"

export type Sound = { at: number; name: SoundName; volume: number }

// The virtual microphone: capture rewinds voice-input.wav into the emulator
// just before the voice button tap. Played so the words land just after the
// audio, the way real dictation reads.
const VOICE_WAV_AT = 179.5

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
    sounds.push({ at: 9.4 + index / 10, name: "key", volume: 1 })
  }
  sounds.push({ at: 10.52, name: "enter", volume: 1 })
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
