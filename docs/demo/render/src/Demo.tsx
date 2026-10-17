import {
  AbsoluteFill,
  Audio,
  interpolate,
  Sequence,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from "remotion"
import { monoFamily, sansFamily } from "./fonts"
import { Mark } from "./mark"
import { PhoneFrame, phoneFrameSize, rippleProgress } from "./phone"
import { Terminal } from "./terminal"
import {
  buildTimeline,
  captureAt,
  channel,
  phoneBlack,
  phoneCenterX,
  phoneTop,
  phoneWidth,
  TERM_BOX,
  TERM_ORIGIN,
  termOpacity,
  termScale,
  termX,
  totalSec,
  type Caption,
  type DemoProps,
} from "./timeline"
import { ink, inkOnLime, lime, line, mute, paper } from "./theme"

const CTA = "bun install -g @codenamegary/harold@latest"
const SUBTITLE = "Hark! The Harold Agents Sing"

const ease = (progress: number) => interpolate(progress, [0, 1], [0, 1])

const reveal = (frame: number, fps: number, from: number) =>
  interpolate(frame, [from * fps, (from + 0.6) * fps], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: ease,
  })

const lift = (frame: number, fps: number, from: number) =>
  `0px ${interpolate(frame, [from * fps, (from + 0.6) * fps], [18, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: ease,
  })}px`

// The intro and outro share one slide: logo, subtitle, install command.
const Slide: React.FC<{ showSite: boolean; intro: boolean }> = ({ showSite, intro }) => {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()
  // The outro card counts frames from its own sequence start; the intro is
  // the composition open. Same choreography either way.
  const first = 0.25
  const step = 0.3
  const site = showSite ? (
    <div
      style={{
        marginTop: 34,
        fontSize: 26,
        color: mute,
        opacity: reveal(frame, fps, first + step * 3),
        translate: lift(frame, fps, first + step * 3),
      }}
    >
      harold.codenamegary.com
    </div>
  ) : null
  return (
    <AbsoluteFill
      style={{
        background: intro ? ink : undefined,
        alignItems: "center",
        justifyContent: "center",
        fontFamily: sansFamily,
      }}
    >
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
        <div
          style={{
            opacity: reveal(frame, fps, first),
            translate: lift(frame, fps, first),
          }}
        >
          <Mark size={132} />
        </div>
        <div
          style={{
            marginTop: 30,
            fontSize: 68,
            fontWeight: 600,
            color: paper,
            letterSpacing: "-0.02em",
            opacity: reveal(frame, fps, first + step),
            translate: lift(frame, fps, first + step),
          }}
        >
          Harold
        </div>
        <div
          style={{
            marginTop: 16,
            fontSize: 30,
            color: mute,
            opacity: reveal(frame, fps, first + step * 2),
            translate: lift(frame, fps, first + step * 2),
          }}
        >
          {SUBTITLE}
        </div>
        <div
          style={{
            marginTop: 44,
            fontFamily: monoFamily,
            fontSize: 27,
            fontWeight: 500,
            color: inkOnLime,
            background: lime,
            padding: "18px 30px",
            borderRadius: 14,
            boxShadow: `0 0 0 1px ${line}`,
            opacity: reveal(frame, fps, first + step * 3),
            translate: lift(frame, fps, first + step * 3),
          }}
        >
          {CTA}
        </div>
        {site}
      </div>
    </AbsoluteFill>
  )
}

const IntroCard: React.FC = () => {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()
  // The card sits over the stage and fades away as the terminal zooms in.
  const opacity = interpolate(frame, [2.95 * fps, 3.55 * fps], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: ease,
  })
  if (opacity === 0) {
    return null
  }
  return (
    <AbsoluteFill style={{ opacity }}>
      <Slide showSite={false} intro />
    </AbsoluteFill>
  )
}

const OutroCard: React.FC<{ from: number }> = ({ from }) => {
  const { fps } = useVideoConfig()
  return (
    <Sequence from={Math.round(from * fps)} premountFor={fps}>
      <AbsoluteFill style={{ background: ink }}>
        <Slide showSite intro={false} />
      </AbsoluteFill>
    </Sequence>
  )
}

const TerminalStage: React.FC<{ timeline: ReturnType<typeof buildTimeline> }> = ({ timeline }) => {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()
  const sec = frame / fps
  return (
    <div
      style={{
        position: "absolute",
        left: TERM_BOX.left,
        top: TERM_BOX.top,
        width: TERM_BOX.width,
        height: TERM_BOX.height,
        opacity: channel(termOpacity, sec),
        translate: `${channel(termX, sec)}px 0px`,
        scale: `${channel(termScale, sec)}`,
        transformOrigin: TERM_ORIGIN,
      }}
    >
      <Terminal items={timeline.terminal} />
    </div>
  )
}

const PhoneStage: React.FC<{
  timeline: ReturnType<typeof buildTimeline>
  videoWidth: number
  videoHeight: number
}> = ({ timeline, videoWidth, videoHeight }) => {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()
  const sec = frame / fps
  const screenWidth = channel(phoneWidth, sec)
  const size = phoneFrameSize(videoWidth, videoHeight, screenWidth)
  const left = channel(phoneCenterX, sec) - size.frameWidth / 2
  const top = channel(phoneTop, sec)
  const active = timeline.ripples
    .map((ripple) => ({ ...ripple, progress: rippleProgress(sec, ripple.at) }))
    .filter((ripple) => ripple.progress > 0 && ripple.progress < 1)
  return (
    <div style={{ position: "absolute", left, top }}>
      <PhoneFrame
        videoWidth={videoWidth}
        videoHeight={videoHeight}
        screenWidth={screenWidth}
        captureFrame={captureAt(sec) * fps}
        blackOpacity={channel(phoneBlack, sec)}
        ripples={active}
      />
    </div>
  )
}

// [CAP] one classy line at the bottom of the stage: fades in with a lift,
// holds, fades out.
const CaptionView: React.FC<{ caption: Caption; sec: number }> = ({ caption, sec }) => {
  const { at, hold, text } = caption
  const since = sec - at
  const total = hold + 0.85
  if (since < 0 || since > total) {
    return null
  }
  const opacity =
    since < 0.35
      ? interpolate(since, [0, 0.35], [0, 1], { easing: ease })
      : interpolate(since, [total - 0.5, total], [1, 0], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
          easing: ease,
        })
  return (
    <div
      style={{
        position: "absolute",
        left: 0,
        right: 0,
        bottom: 64,
        display: "flex",
        justifyContent: "center",
        pointerEvents: "none",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          fontFamily: sansFamily,
          fontSize: 33,
          fontWeight: 500,
          color: paper,
          background: "rgba(8, 10, 13, 0.72)",
          border: `1px solid ${line}`,
          borderRadius: 999,
          padding: "16px 34px",
          opacity,
          translate: `0px ${interpolate(since, [0, 0.35], [10, 0], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: ease,
          })}px`,
        }}
      >
        {text}
      </div>
    </div>
  )
}

const Music: React.FC<{ endSec: number }> = ({ endSec }) => {
  const { fps } = useVideoConfig()
  const totalFrames = Math.round(totalSec(endSec) * fps)
  return (
    <Audio
      src={staticFile("music.mp3")}
      loop
      volume={(frame) =>
        interpolate(
          frame,
          [0, 0.8 * fps, totalFrames - 3 * fps, totalFrames - 0.3 * fps],
          [0, 0.55, 0.55, 0],
          { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
        )
      }
    />
  )
}

export const Demo: React.FC<DemoProps> = ({ videoWidth, videoHeight, captureSec }) => {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()
  const sec = frame / fps
  const timeline = buildTimeline(captureSec)
  return (
    <AbsoluteFill style={{ background: ink, color: paper }}>
      <Music endSec={timeline.endSec} />
      <TerminalStage timeline={timeline} />
      <PhoneStage timeline={timeline} videoWidth={videoWidth} videoHeight={videoHeight} />
      {timeline.captions.map((caption) => (
        <CaptionView key={caption.at} caption={caption} sec={sec} />
      ))}
      {/* Scheduled sound effects, one short Sequence each. */}
      {timeline.sounds.map((sound, index) => (
        <Sequence key={index} from={Math.round(sound.at * fps)}>
          <Audio src={staticFile(`sfx/${sound.name}.wav`)} volume={sound.volume} />
        </Sequence>
      ))}
      <Sequence from={Math.round(timeline.voiceWavAt * fps)}>
        <Audio src={staticFile("voice-input.wav")} volume={0.85} />
      </Sequence>
      <IntroCard />
      <OutroCard from={timeline.endSec - 0.15} />
    </AbsoluteFill>
  )
}
