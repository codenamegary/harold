import { OffthreadVideo, staticFile } from "remotion"

const screenWidth = 360

export const phoneFrameSize = (videoWidth: number, videoHeight: number) => {
  const height = Math.round((screenWidth * videoHeight) / videoWidth)
  return {
    screenWidth,
    screenHeight: height,
    frameWidth: screenWidth + 20,
    frameHeight: height + 20,
  }
}

export const PhoneFrame: React.FC<{
  videoWidth: number
  videoHeight: number
}> = ({ videoWidth, videoHeight }) => {
  const size = phoneFrameSize(videoWidth, videoHeight)
  return (
    <div
      style={{
        width: size.frameWidth,
        height: size.frameHeight,
        borderRadius: 42,
        background: "#1A1F26",
        padding: 10,
        boxShadow: "0 30px 80px rgba(0,0,0,0.45)",
      }}
    >
      <div
        style={{
          width: size.screenWidth,
          height: size.screenHeight,
          borderRadius: 32,
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
