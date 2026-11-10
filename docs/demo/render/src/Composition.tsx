import { Composition, staticFile } from "remotion"
import { Demo } from "./Demo"
import { FPS, totalSec, type CaptureSlice } from "./timeline"

type CaptureFile = {
  width: number
  height: number
  slices: CaptureSlice[]
}

export const MyComposition = () => {
  return (
    <Composition
      id="HaroldDemo"
      component={Demo}
      durationInFrames={FPS * 30}
      fps={FPS}
      width={1920}
      height={1080}
      defaultProps={{
        slices: [],
        videoWidth: 1080,
        videoHeight: 2400,
      }}
      calculateMetadata={async () => {
        const response = await fetch(staticFile("capture.json"))
        if (!response.ok) {
          throw new Error("Missing public/capture.json. Run docs/demo/capture/capture.sh first.")
        }
        const capture = (await response.json()) as CaptureFile
        return {
          durationInFrames: Math.max(1, Math.round(totalSec(capture.slices) * FPS)),
          props: {
            slices: capture.slices,
            videoWidth: capture.width,
            videoHeight: capture.height,
          },
        }
      }}
    />
  )
}
