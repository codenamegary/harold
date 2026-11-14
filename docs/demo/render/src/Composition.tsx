import { Composition, staticFile } from "remotion"
import { ACHIEVEMENT_DURATION } from "./achievement.cut"
import { AchievementFilm } from "./achievement.scene"
import { BuildFilm } from "./build.scene"
import { ChangesFilm } from "./changes.scene"
import { Demo } from "./Demo"
import { NewSessionFilm } from "./newSession.scene"
import { OPENING_DURATION } from "./opening.cut"
import { OpeningFilm } from "./opening.scene"
import { OutroFilm } from "./outro.scene"
import { PlanFilm } from "./plan.scene"
import { PrFilm } from "./pr.scene"
import { QuestionFilm } from "./question.scene"
import { FPS, buildTimeline, type CaptureSlice, type DemoProps, type SceneSlug } from "./timeline"
import { UsageFilm } from "./usage.scene"
import { WorktreesFilm } from "./worktrees.scene"

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

const sceneMetadata = (slug: SceneSlug) => async () => {
  const capture = await loadCapture()
  const timeline = buildTimeline(capture.slices)
  const scene = timeline.scenes.find((entry) => entry.slug === slug)
  if (scene === undefined) {
    throw new Error(`the cut has no ${slug} scene`)
  }
  return {
    durationInFrames: scene.frames,
    props: {
      slices: capture.slices,
      videoWidth: capture.width,
      videoHeight: capture.height,
    },
  }
}

const SCENE_COMPOSITIONS: {
  id: string
  component: React.FC<DemoProps>
  slug: SceneSlug
}[] = [
  { id: "HaroldNewSession", component: NewSessionFilm, slug: "newSession" },
  { id: "HaroldPlan", component: PlanFilm, slug: "plan" },
  { id: "HaroldQuestion", component: QuestionFilm, slug: "question" },
  { id: "HaroldBuild", component: BuildFilm, slug: "build" },
  { id: "HaroldUsage", component: UsageFilm, slug: "usage" },
  { id: "HaroldChanges", component: ChangesFilm, slug: "changes" },
  { id: "HaroldWorktrees", component: WorktreesFilm, slug: "worktrees" },
  { id: "HaroldPr", component: PrFilm, slug: "pr" },
  { id: "HaroldOutro", component: OutroFilm, slug: "outro" },
]

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
        durationInFrames={OPENING_DURATION}
        fps={FPS}
        width={1920}
        height={1080}
      />
      <Composition
        id="HaroldAchievement"
        component={AchievementFilm}
        durationInFrames={ACHIEVEMENT_DURATION}
        fps={FPS}
        width={1920}
        height={1080}
      />
      {SCENE_COMPOSITIONS.map(({ id, component, slug }) => (
        <Composition
          key={id}
          id={id}
          component={component}
          durationInFrames={150}
          fps={FPS}
          width={1920}
          height={1080}
          defaultProps={{
            slices: [],
            videoWidth: 1080,
            videoHeight: 2400,
          }}
          calculateMetadata={sceneMetadata(slug)}
        />
      ))}
    </>
  )
}
