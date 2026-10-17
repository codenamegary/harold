import { Composition, staticFile } from "remotion"
import { Demo } from "./Demo"
import { FPS, INTRO_SEC, OUTRO_SEC, totalSec, type DemoProps } from "./timeline"

type CaptureFile = {
  durationSec: number
  width: number
  height: number
  events: DemoProps["events"]
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
        events: [],
        videoWidth: 1080,
        videoHeight: 2400,
        captureSec: 30 - INTRO_SEC - OUTRO_SEC,
      }}
      calculateMetadata={async () => {
        const response = await fetch(staticFile("capture.json"))
        if (!response.ok) {
          throw new Error("Missing public/capture.json. Run docs/demo/capture/capture.sh first.")
        }
        const capture = (await response.json()) as CaptureFile
        return {
          durationInFrames: Math.max(1, Math.round(totalSec(capture.durationSec) * FPS)),
          props: {
            events: capture.events,
            videoWidth: capture.width,
            videoHeight: capture.height,
            captureSec: capture.durationSec,
          },
        }
      }}
    />
  )
}
