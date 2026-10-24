import { AbsoluteFill, Freeze, interpolate, OffthreadVideo, staticFile, useVideoConfig } from "remotion"
import {
  channel,
  clipFrame,
  phoneCenterX,
  phoneTop,
  phoneWidth,
  rippleColor,
  rippleDuration,
  type PhoneClip,
  type Zoom,
} from "./timeline"
import { line } from "./theme"

const BEZEL = 10
const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const

export const phoneFrameSize = (videoWidth: number, videoHeight: number, screenWidth: number) => {
  const height = Math.round((screenWidth * videoHeight) / videoWidth)
  return {
    screenWidth,
    screenHeight: height,
    frameWidth: screenWidth + BEZEL * 2,
    frameHeight: height + BEZEL * 2,
  }
}

// The visible phone screen after the phone dock and camera zoom. Overlays use
// this so a frame tracks the phone even while the camera moves.
export type PhoneScreenRect = {
  left: number
  top: number
  width: number
  height: number
  frameBezel: number
}

export const phoneScreenRect = (
  sec: number,
  stageW: number,
  stageH: number,
  videoWidth: number,
  videoHeight: number,
  zoom: Zoom,
): PhoneScreenRect => {
  const screenWidth = channel(phoneWidth, sec)
  const size = phoneFrameSize(videoWidth, videoHeight, screenWidth)
  const left = channel(phoneCenterX, sec) - size.frameWidth / 2
  const top = channel(phoneTop, sec)
  const scale = channel(zoom.scale, sec)
  const bezel = (size.frameWidth - size.screenWidth) / 2
  const originX = bezel + channel(zoom.x, sec) * size.screenWidth
  const originY = bezel + channel(zoom.y, sec) * size.screenHeight
  const pointX = left + originX
  const pointY = top + originY
  const scaledTop = pointY - originY * scale
  const scaledBottom = pointY + (size.frameHeight - originY) * scale
  const scaledCenterX = pointX + (size.frameWidth / 2 - originX) * scale
  const weight = interpolate(scale, [1, 1.3], [0, 1], clamp)
  const wantY = stageH / 2 - pointY
  const overscan = (bezel + 44) * scale
  const lo = stageH - scaledBottom + overscan
  const hi = -scaledTop - overscan
  const slideY = lo <= hi ? Math.min(hi, Math.max(lo, wantY)) : (lo + hi) / 2
  const slideX = stageW / 2 - scaledCenterX

  return {
    left: pointX + slideX * weight + (bezel - originX) * scale,
    top: pointY + slideY * weight + (bezel - originY) * scale,
    width: size.screenWidth * scale,
    height: size.screenHeight * scale,
    frameBezel: bezel * scale,
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
