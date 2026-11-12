import { Audio, interpolate, staticFile, useVideoConfig } from "remotion"
import { MUSIC_VOLUME } from "./timeline"

// The bed is measured, not dialled by ear. music.mp3 is -10.43 LUFS with a
// +0.80 dBTP peak, so MUSIC_VOLUME lands it at -26.3 LUFS / -15.1 dBTP: a
// measured 11 dB under a tap and 7 dB under a real keystroke.
export const Music: React.FC = () => {
  const { fps, durationInFrames } = useVideoConfig()
  return (
    <Audio
      src={staticFile("music.mp3")}
      loop
      volume={(frame) =>
        interpolate(
          frame,
          [0, 0.8 * fps, durationInFrames - 3 * fps, durationInFrames - 0.4 * fps],
          [0, MUSIC_VOLUME, MUSIC_VOLUME, 0],
          { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
        )
      }
    />
  )
}
