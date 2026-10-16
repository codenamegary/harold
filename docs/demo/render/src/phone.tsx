import { OffthreadVideo, staticFile } from "remotion"
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

export const PhoneFrame: React.FC<{
  videoWidth: number
  videoHeight: number
  screenWidth: number
}> = ({ videoWidth, videoHeight, screenWidth }) => {
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
          width: size.screenWidth,
          height: size.screenHeight,
          borderRadius: 34,
          overflow: "hidden",
          background: "#000",
        }}
      >
        <OffthreadVideo
          src={staticFile("phone.mp4")}
          style={{ width: size.screenWidth, height: size.screenHeight }}
        />
      </div>
    </div>
  )
}
