import { AbsoluteFill, Freeze, OffthreadVideo, staticFile, useVideoConfig } from "remotion"
import { clipFrame, rippleColor, rippleDuration, type PhoneClip } from "./timeline"
import { line } from "./theme"

const BEZEL = 10

export const phoneFrameSize = (videoWidth: number, videoHeight: number, screenWidth: number) => {
  const height = Math.round((screenWidth * videoHeight) / videoWidth)
  return {
    screenWidth,
    screenHeight: height,
    frameWidth: screenWidth + BEZEL * 2,
    frameHeight: height + BEZEL * 2,
  }
}

// [TAP] a quick ring blooms where the finger landed.
const Ripple: React.FC<{ progress: number }> = ({ progress }) => (
  <>
    <div
      style={{
        position: "absolute",
        width: 56,
        height: 56,
        borderRadius: 28,
        border: `3px solid ${rippleColor}`,
        translate: "-50% -50%",
        scale: `${0.4 + progress * 0.9}`,
        opacity: 0.85 * (1 - progress),
      }}
    />
    <div
      style={{
        position: "absolute",
        width: 56,
        height: 56,
        borderRadius: 28,
        background: rippleColor,
        translate: "-50% -50%",
        scale: `${0.2 + progress * 0.6}`,
        opacity: 0.28 * (1 - progress),
      }}
    />
  </>
)

export const PhoneFrame: React.FC<{
  videoWidth: number
  videoHeight: number
  screenWidth: number
  clip: PhoneClip | null
  sec: number
  blackOpacity: number
  ripples: { at: number; progress: number; x: number; y: number }[]
}> = ({ videoWidth, videoHeight, screenWidth, clip, sec, blackOpacity, ripples }) => {
  const { fps } = useVideoConfig()
  const size = phoneFrameSize(videoWidth, videoHeight, screenWidth)
  return (
    <div
      style={{
        width: size.frameWidth,
        height: size.frameHeight,
        borderRadius: 44,
        background: "#1A1F26",
        border: `1px solid ${line}`,
        padding: BEZEL - 1,
        boxShadow: "0 1px 0 rgba(255,255,255,0.05) inset, 0 40px 90px rgba(0,0,0,0.6)",
      }}
    >
      <div
        style={{
          position: "relative",
          width: size.screenWidth,
          height: size.screenHeight,
          borderRadius: 34,
          overflow: "hidden",
          background: "#000",
        }}
      >
        {clip !== null ? (
          <Freeze frame={Math.round(clipFrame(clip, sec) * fps)}>
            <OffthreadVideo
              src={staticFile(clip.file)}
              muted
              style={{ width: size.screenWidth, height: size.screenHeight }}
            />
          </Freeze>
        ) : null}
        <AbsoluteFill style={{ background: "#000", opacity: blackOpacity }} />
        {ripples.map((ripple, index) => (
          <div
            key={index}
            style={{
              position: "absolute",
              left: ripple.x * size.screenWidth,
              top: ripple.y * size.screenHeight,
            }}
          >
            <Ripple progress={ripple.progress} />
          </div>
        ))}
      </div>
    </div>
  )
}

export const rippleProgress = (sec: number, at: number): number =>
  Math.min(1, Math.max(0, (sec - at) / rippleDuration))
