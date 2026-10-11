import { Composition, staticFile } from "remotion"
import { Demo, type DemoProps } from "./Demo"
import { fps } from "./theme"

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
      durationInFrames={fps * 30}
      fps={fps}
      width={1920}
      height={1080}
      defaultProps={{
        events: [],
        videoWidth: 1080,
        videoHeight: 2400,
      }}
      calculateMetadata={async () => {
        const response = await fetch(staticFile("capture.json"))
        if (!response.ok) {
          throw new Error("Missing public/capture.json. Run docs/demo-pipeline/capture.sh first.")
        }
        const capture = (await response.json()) as CaptureFile
        return {
          durationInFrames: Math.max(1, Math.round(capture.durationSec * fps)),
          props: {
            events: capture.events,
            videoWidth: capture.width,
            videoHeight: capture.height,
          },
        }
      }}
    />
  )
}
