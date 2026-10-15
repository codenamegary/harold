import {
  AbsoluteFill,
  Easing,
  interpolate,
  Sequence,
  useCurrentFrame,
  useVideoConfig,
} from "remotion"
import { monoFamily, sansFamily } from "./fonts"
import { Mark } from "./mark"
import { PhoneFrame, phoneFrameSize } from "./phone"
import { stepsFrom } from "./steps"
import { Terminal, terminalBox } from "./terminal"
import { body, ink, inkOnLime, lime, mute, paper, stage } from "./theme"

export type CaptureEvent = {
  name: string
  sec: number
}

export type DemoProps = {
  events: CaptureEvent[]
  videoWidth: number
  videoHeight: number
  captureSec: number
}

// Title card before the phone recording, end card after it.
export const INTRO_SEC = 2.8
export const OUTRO_SEC = 4

const PHONE_SCREEN_W = 336
const CAPTION_H = 60

// After the device list the terminal has said its part: the phone takes
// center stage this many seconds after pairing lands, at this screen
// width, this far from the top of the frame.
const FOCUS_AFTER_PAIRED_SEC = 8
const FOCUS_SCREEN_W = 400
const FOCUS_TOP = 72

// The lockup lives in the header during the walkthrough. On the title and
// end cards it is the same element, three times the size and centred.
const LOCKUP = { markSize: 40, fontSize: 30, gap: 14, width: 144, height: 44 }
const CARD_SCALE = 3
const cardLeft = (1920 - LOCKUP.width * CARD_SCALE) / 2
const cardTop = 434
const CARD_LINE_TOP = cardTop + LOCKUP.height * CARD_SCALE + 44
const MOVE = 0.6

const ease = Easing.bezier(0.16, 1, 0.3, 1)

const Brand: React.FC<{ captureEndSec: number }> = ({ captureEndSec }) => {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()
  const sec = frame / fps
  // 0 = card (big, centred), 1 = header (small, top left).
  const t = interpolate(
    sec,
    [INTRO_SEC - MOVE, INTRO_SEC, captureEndSec - MOVE + 0.1, captureEndSec + 0.1],
    [0, 1, 1, 0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: ease },
  )
  const left = interpolate(t, [0, 1], [cardLeft, stage.margin])
  const top = interpolate(t, [0, 1], [cardTop, stage.headerTop])
  const scale = interpolate(t, [0, 1], [CARD_SCALE, 1])
  return (
    <div
      style={{
        position: "absolute",
        left,
        top,
        width: LOCKUP.width,
        height: LOCKUP.height,
        display: "flex",
        alignItems: "center",
        gap: LOCKUP.gap,
        fontFamily: sansFamily,
        transformOrigin: "left top",
        scale: `${scale}`,
        opacity: interpolate(frame, [0, 0.6 * fps], [0, 1], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
          easing: ease,
        }),
      }}
    >
      <Mark size={LOCKUP.markSize} />
      <span
        style={{
          fontSize: LOCKUP.fontSize,
          fontWeight: 600,
          color: paper,
          letterSpacing: "-0.01em",
          whiteSpace: "nowrap",
        }}
      >
        Harold
      </span>
    </div>
  )
}

const Tagline: React.FC<{ captureFrames: number }> = ({ captureFrames }) => {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()
  const introFrames = Math.round(INTRO_SEC * fps)
  const onCard = frame < introFrames
  return (
    <div
      style={{
        position: "absolute",
        left: onCard ? 0 : "auto",
        right: onCard ? 0 : stage.margin,
        top: onCard ? CARD_LINE_TOP : stage.headerTop,
        height: onCard ? "auto" : LOCKUP.height,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontFamily: sansFamily,
        fontSize: onCard ? 36 : 22,
        color: mute,
        opacity: onCard
          ? interpolate(
              frame,
              [0.5 * fps, 1.1 * fps, (INTRO_SEC - MOVE - 0.5) * fps, (INTRO_SEC - MOVE) * fps],
              [0, 1, 1, 0],
              { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
            )
          : interpolate(
              frame,
              [
                introFrames,
                introFrames + 0.5 * fps,
                introFrames + captureFrames - 0.5 * fps,
                introFrames + captureFrames,
              ],
              [0, 1, 1, 0],
              { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
            ),
        translate: onCard
          ? `0px ${interpolate(frame, [0.5 * fps, 1.1 * fps], [10, 0], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
              easing: ease,
            })}px`
          : "0px 0px",
      }}
    >
      Your agents, anywhere.
    </div>
  )
}

const Caption: React.FC<{ events: CaptureEvent[]; left: number; width: number; top: number }> = ({
  events,
  left,
  width,
  top,
}) => {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()
  const sec = frame / fps
  const steps = stepsFrom(events)
  const current = [...steps].reverse().find((step) => step.at <= sec)
  if (current === undefined) {
    return null
  }
  const since = (sec - current.at) * fps
  return (
    <div
      style={{
        position: "absolute",
        left,
        width,
        top,
        height: CAPTION_H,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        textAlign: "center",
        fontFamily: sansFamily,
        fontSize: 24,
        fontWeight: 500,
        lineHeight: 1.25,
        color: body,
        opacity: interpolate(since, [0, 0.35 * fps], [0, 1], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
          easing: Easing.out(Easing.quad),
        }),
        translate: `0px ${interpolate(since, [0, 0.35 * fps], [8, 0], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
          easing: Easing.out(Easing.quad),
        })}px`,
      }}
    >
      {current.text}
    </div>
  )
}

const Outro: React.FC = () => {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()
  const reveal = (from: number) =>
    interpolate(frame, [from * fps, (from + 0.6) * fps], [0, 1], {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
      easing: ease,
    })
  const lift = (from: number) =>
    `0px ${interpolate(frame, [from * fps, (from + 0.6) * fps], [14, 0], {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
      easing: ease,
    })}px`
  return (
    <AbsoluteFill style={{ alignItems: "center", fontFamily: sansFamily }}>
      <div
        style={{
          position: "absolute",
          top: CARD_LINE_TOP - 4,
          fontFamily: monoFamily,
          fontSize: 30,
          fontWeight: 500,
          color: inkOnLime,
          background: lime,
          padding: "16px 28px",
          borderRadius: 12,
          opacity: reveal(0.35),
          translate: lift(0.35),
        }}
      >
        npm install -g @codenamegary/harold
      </div>
      <div
        style={{
          position: "absolute",
          top: CARD_LINE_TOP + 96,
          fontSize: 24,
          color: mute,
          opacity: reveal(0.55),
          translate: lift(0.55),
        }}
      >
        github.com/codenamegary/harold
      </div>
    </AbsoluteFill>
  )
}

export const Demo: React.FC<DemoProps> = ({ events, videoWidth, videoHeight, captureSec }) => {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()
  const paired = events.find((event) => event.name === "paired_chat_visible")?.sec ?? 17.1

  const columnLeft = terminalBox.left + terminalBox.width
  const columnWidth = 1920 - stage.margin - columnLeft
  const captionTop = stage.contentBottom - CAPTION_H

  const introFrames = Math.round(INTRO_SEC * fps)
  const captureFrames = Math.round(captureSec * fps)
  const captureEnd = introFrames + captureFrames

  // Once the terminal has printed the device list it has nothing left to
  // say: the phone zooms to center stage and the terminal recedes.
  const focusAt = paired + FOCUS_AFTER_PAIRED_SEC
  const relSec = (frame - introFrames) / fps
  const focus = interpolate(relSec, [focusAt, focusAt + 0.9], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: ease,
  })

  const size = phoneFrameSize(
    videoWidth,
    videoHeight,
    interpolate(focus, [0, 1], [PHONE_SCREEN_W, FOCUS_SCREEN_W]),
  )
  const phoneLeft0 = Math.round(
    columnLeft +
      (columnWidth - phoneFrameSize(videoWidth, videoHeight, PHONE_SCREEN_W).frameWidth) / 2,
  )
  const phoneLeft = Math.round(
    interpolate(focus, [0, 1], [phoneLeft0, (1920 - size.frameWidth) / 2]),
  )
  const phoneTop = Math.round(interpolate(focus, [0, 1], [stage.contentTop, FOCUS_TOP]))
  const terminalOpacity = interpolate(focus, [0, 1], [1, 0.32])
  const terminalShift = interpolate(focus, [0, 1], [0, -56])
  const terminalScale = interpolate(focus, [0, 1], [1, 0.94])

  return (
    <AbsoluteFill style={{ background: ink, color: paper }}>
      <Sequence
        name="Walkthrough"
        from={introFrames}
        durationInFrames={captureFrames}
        premountFor={fps}
      >
        <AbsoluteFill
          style={{
            opacity: interpolate(
              frame - introFrames,
              [0, 0.5 * fps, captureFrames - 0.5 * fps, captureFrames],
              [0, 1, 1, 0],
              { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
            ),
          }}
        >
          <div
            style={{
              position: "absolute",
              inset: 0,
              opacity: terminalOpacity,
              translate: `${terminalShift}px 0px`,
              scale: `${terminalScale}`,
              transformOrigin: "left center",
            }}
          >
            <Terminal pairedSec={paired} />
          </div>
          <div style={{ position: "absolute", left: phoneLeft, top: phoneTop }}>
            <PhoneFrame
              videoWidth={videoWidth}
              videoHeight={videoHeight}
              screenWidth={size.screenWidth}
            />
          </div>
          <Caption
            events={events}
            left={interpolate(focus, [0, 1], [columnLeft, 120])}
            width={interpolate(focus, [0, 1], [columnWidth, 980])}
            top={captionTop}
          />
        </AbsoluteFill>
      </Sequence>
      <Sequence name="End card" from={captureEnd} premountFor={fps}>
        <Outro />
      </Sequence>
      <Tagline captureFrames={captureFrames} />
      <Brand captureEndSec={captureEnd / fps} />
    </AbsoluteFill>
  )
}
