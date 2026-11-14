import { Audio, interpolate, staticFile, useVideoConfig } from "remotion"
import { MUSIC_VOLUME } from "./timeline"

/**
 * The music envelope: fade in at the start and fade out at the end. A short
 * preview compresses the windows so the keyframes stay ordered.
 */
export const musicVolumeAt = (frame: number, fps: number, durationInFrames: number): number => {
  const fadeInEnd = Math.max(1, Math.min(0.8 * fps, durationInFrames / 2))
  const fadeOutStart = Math.max(fadeInEnd + 1, durationInFrames - 3 * fps)
  const fadeOutEnd = Math.max(fadeOutStart + 1, durationInFrames - 0.4 * fps)
  return interpolate(
    frame,
    [0, fadeInEnd, fadeOutStart, fadeOutEnd],
    [0, MUSIC_VOLUME, MUSIC_VOLUME, 0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
  )
}

export const Music: React.FC = () => {
  const { fps, durationInFrames } = useVideoConfig()
  return (
    <Audio
      src={staticFile("music.mp3")}
      loop
      volume={(frame) => musicVolumeAt(frame, fps, durationInFrames)}
    />
  )
}
