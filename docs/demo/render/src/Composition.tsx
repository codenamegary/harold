import { Composition, staticFile } from "remotion"
import { AchievementFilm } from "./achievement.scene"
import { Demo } from "./Demo"
import { NewSessionFilm } from "./newSession.scene"
import { OpeningFilm } from "./opening.scene"
import { FPS, buildTimeline, type CaptureSlice } from "./timeline"

type CaptureFile = {
  width: number
  height: number
  slices: CaptureSlice[]
}

const loadCapture = async (): Promise<CaptureFile> => {
  const response = await fetch(staticFile("capture.json"))
  if (!response.ok) {
    throw new Error("Missing public/capture.json. Run docs/demo/capture/capture.sh first.")
  }
  return (await response.json()) as CaptureFile
}

export const MyComposition = () => {
  return (
    <>
      <Composition
        id="HaroldDemo"
        component={Demo}
        durationInFrames={150}
        fps={FPS}
        width={1920}
        height={1080}
        defaultProps={{
          slices: [],
          videoWidth: 1080,
          videoHeight: 2400,
        }}
        calculateMetadata={async () => {
          const capture = await loadCapture()
          const timeline = buildTimeline(capture.slices)
          return {
            durationInFrames: Math.round(timeline.endSec * FPS),
            props: {
              slices: capture.slices,
              videoWidth: capture.width,
              videoHeight: capture.height,
            },
          }
        }}
      />
      <Composition
        id="HaroldOpening"
        component={OpeningFilm}
        durationInFrames={150}
        fps={FPS}
        width={1920}
        height={1080}
        defaultProps={{
          slices: [],
          videoWidth: 1080,
          videoHeight: 2400,
        }}
        calculateMetadata={async () => {
          const capture = await loadCapture()
          const timeline = buildTimeline(capture.slices)
          const ssh = timeline.scenes.find((scene) => scene.slug === "ssh")
          if (ssh === undefined) {
            throw new Error("the cut has no ssh scene")
          }
          return {
            durationInFrames: Math.round(ssh.to * FPS),
            props: {
              slices: capture.slices,
              videoWidth: capture.width,
              videoHeight: capture.height,
            },
          }
        }}
      />
      <Composition
        id="HaroldAchievement"
        component={AchievementFilm}
        durationInFrames={150}
        fps={FPS}
        width={1920}
        height={1080}
        defaultProps={{
          slices: [],
          videoWidth: 1080,
          videoHeight: 2400,
        }}
        calculateMetadata={async () => {
          const capture = await loadCapture()
          const timeline = buildTimeline(capture.slices)
          const achievement = timeline.scenes.find((scene) => scene.slug === "achievement")
          if (achievement === undefined) {
            throw new Error("the cut has no achievement scene")
          }
          return {
            durationInFrames: achievement.frames,
            props: {
              slices: capture.slices,
              videoWidth: capture.width,
              videoHeight: capture.height,
            },
          }
        }}
      />
      <Composition
        id="HaroldNewSession"
        component={NewSessionFilm}
        durationInFrames={150}
        fps={FPS}
        width={1920}
        height={1080}
        defaultProps={{
          slices: [],
          videoWidth: 1080,
          videoHeight: 2400,
        }}
        calculateMetadata={async () => {
          const capture = await loadCapture()
          const timeline = buildTimeline(capture.slices)
          const newSession = timeline.scenes.find((scene) => scene.slug === "newSession")
          if (newSession === undefined) {
            throw new Error("the cut has no new-session scene")
          }
          return {
            durationInFrames: newSession.frames,
            props: {
              slices: capture.slices,
              videoWidth: capture.width,
              videoHeight: capture.height,
            },
          }
        }}
      />
    </>
  )
}
