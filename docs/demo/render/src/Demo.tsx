import {
  AbsoluteFill,
  Audio,
  interpolate,
  Sequence,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from "remotion"
import { celebrationStyle } from "./celebration"
import { Confetti } from "./confetti"
import { monoFamily, sansFamily } from "./fonts"
import { Mark } from "./mark"
import { PhoneFrame, phoneFrameSize, rippleProgress } from "./phone"
import { SpotlightView } from "./spotlight"
import { Terminal } from "./terminal"
import {
  activeClip,
  buildTimeline,
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
  const { fps, width: stageW, height: stageH } = useVideoConfig()
  const sec = frame / fps
  const screenWidth = channel(phoneWidth, sec)
  const size = phoneFrameSize(videoWidth, videoHeight, screenWidth)
  const left = channel(phoneCenterX, sec) - size.frameWidth / 2
  const top = channel(phoneTop, sec)
  const active = timeline.ripples
    .map((ripple) => ({ ...ripple, progress: rippleProgress(sec, ripple.at) }))
    .filter((ripple) => ripple.progress > 0 && ripple.progress < 1)
  // [ZOOM] scale the phone about the focus point, then slide that point
  // toward the middle of the stage. The slide is clamped so a zoomed phone
  // always covers the stage edge it crosses: no bezel or void peeks in.
  const scale = channel(timeline.zoom.scale, sec)
  const bezel = (size.frameWidth - size.screenWidth) / 2
  const originX = bezel + channel(timeline.zoom.x, sec) * size.screenWidth
  const originY = bezel + channel(timeline.zoom.y, sec) * size.screenHeight
  const pointX = left + originX
  const pointY = top + originY
  const scaledTop = pointY - originY * scale
  const scaledBottom = pointY + (size.frameHeight - originY) * scale
  const scaledCenterX = pointX + (size.frameWidth / 2 - originX) * scale
  const weight = interpolate(scale, [1, 1.3], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  })
  const wantY = stageH / 2 - pointY
  // Keep the bezel and its rounded corners past the stage edge.
  // When the phone is shorter than the stage the bounds cross; centering it
  // then keeps the slide continuous as the scale eases through.
  const overscan = (bezel + 44) * scale
  const lo = stageH - scaledBottom + overscan
  const hi = -scaledTop - overscan
  const slideY = lo <= hi ? Math.min(hi, Math.max(lo, wantY)) : (lo + hi) / 2
  const slideX = stageW / 2 - scaledCenterX
  const pop = celebrationStyle(timeline.celebrations, sec)
  return (
    <div
      style={{
        position: "absolute",
        left,
        top,
        transformOrigin: `${originX}px ${originY}px`,
        transform: `translate(${slideX * weight}px, ${slideY * weight}px) scale(${scale})`,
      }}
    >
      <div
        style={{
          transform: `translate(${pop.x}px, ${pop.y}px) rotate(${pop.rotate}deg) scale(${pop.scaleX}, ${pop.scaleY})`,
          transformOrigin: "50% 68%",
        }}
      >
        <PhoneFrame
          videoWidth={videoWidth}
          videoHeight={videoHeight}
          screenWidth={screenWidth}
          clip={activeClip(timeline.clips, sec)}
          sec={sec}
          blackOpacity={channel(phoneBlack, sec)}
          ripples={active}
        />
      </div>
    </div>
  )
}

// [CAP] one classy line at the bottom of the stage: fades in with a lift,
// holds, fades out.
const CaptionView: React.FC<{ caption: Caption; sec: number; top: boolean }> = ({
  caption,
  sec,
  top,
}) => {
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
        // [ZOOM] a zoomed phone fills the bottom; the top shows the empty chat area.
        ...(top ? { top: 64 } : { bottom: 64 }),
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

const Music: React.FC = () => {
  const { fps, durationInFrames } = useVideoConfig()
  return (
    <Audio
      src={staticFile("music.mp3")}
      loop
      volume={(frame) =>
        interpolate(
          frame,
          [0, 0.8 * fps, durationInFrames - 3 * fps, durationInFrames - 0.3 * fps],
          [0, 0.55, 0.55, 0],
          { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
        )
      }
    />
  )
}

export const Demo: React.FC<DemoProps> = ({ slices, videoWidth, videoHeight }) => {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()
  const sec = frame / fps
  const timeline = buildTimeline(slices)
  // Place each caption from the zoom once it has settled so it never jumps.
  const zoomedAt = (at: number) => channel(timeline.zoom.scale, at + 0.6) > 1.05
  return (
    <AbsoluteFill style={{ background: ink, color: paper }}>
      <Music />
      <TerminalStage timeline={timeline} />
      <PhoneStage timeline={timeline} videoWidth={videoWidth} videoHeight={videoHeight} />
      <Confetti celebrations={timeline.celebrations} sec={sec} />
      {timeline.spotlights.map((spotlight) => (
        <SpotlightView key={spotlight.at} spotlight={spotlight} sec={sec} />
      ))}
      {timeline.captions.map((caption) => (
        <CaptionView key={caption.at} caption={caption} sec={sec} top={zoomedAt(caption.at)} />
      ))}
      {/* Scheduled sound effects, one short Sequence each. */}
      {timeline.sounds.map((sound, index) => (
        <Sequence key={index} from={Math.round(sound.at * fps)}>
          <Audio src={staticFile(`sfx/${sound.name}.wav`)} volume={sound.volume} />
        </Sequence>
      ))}
      <IntroCard />
      <OutroCard from={timeline.endSec - 0.15} />
    </AbsoluteFill>
  )
}
