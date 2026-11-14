import { Sequence, useVideoConfig } from "remotion"
import { useMemo } from "react"
import { ACHIEVEMENT_DURATION } from "./achievement.cut"
import { AchievementScene } from "./achievement.scene"
import { Build } from "./build.scene"
import { Changes } from "./changes.scene"
import { FilmShell } from "./film"
import { FilmClockProvider } from "./global-stage"
import { NewSession } from "./newSession.scene"
import { OPENING_DURATION } from "./opening.cut"
import { OpeningScene } from "./opening.scene"
import { Outro } from "./outro.scene"
import { Plan } from "./plan.scene"
import { Pr } from "./pr.scene"
import { Question } from "./question.scene"
import { FPS, buildTimeline, type DemoProps, type SceneSlug } from "./timeline"
import { Usage } from "./usage.scene"
import { Worktrees } from "./worktrees.scene"

type Act = {
  slug: SceneSlug
  name: string
  Component: React.FC<DemoProps>
}

/**
 * The scenes after the opening and achievement. They still read the global
 * timeline while the rest of the film moves to local cuts.
 */
const ACTS: Act[] = [
  { slug: "newSession", name: "New Session", Component: NewSession },
  { slug: "plan", name: "Plan", Component: Plan },
  { slug: "question", name: "Question", Component: Question },
  { slug: "build", name: "Build", Component: Build },
  { slug: "usage", name: "Usage", Component: Usage },
  { slug: "changes", name: "Changes", Component: Changes },
  { slug: "worktrees", name: "Worktrees", Component: Worktrees },
  { slug: "pr", name: "PR", Component: Pr },
  { slug: "outro", name: "Outro", Component: Outro },
]

export const Demo: React.FC<DemoProps> = (props) => {
  const { fps } = useVideoConfig()
  const timeline = useMemo(() => buildTimeline(props.slices), [props.slices])

  return (
    <FilmShell>
      <Sequence durationInFrames={OPENING_DURATION} name="Opening">
        <FilmClockProvider startSec={0}>
          <OpeningScene />
        </FilmClockProvider>
      </Sequence>
      <Sequence
        from={OPENING_DURATION}
        durationInFrames={ACHIEVEMENT_DURATION}
        name="Achievement"
      >
        <FilmClockProvider startSec={OPENING_DURATION / FPS}>
          <AchievementScene />
        </FilmClockProvider>
      </Sequence>
      {ACTS.map(({ slug, name, Component }) => {
        const scene = timeline.scenes.find((entry) => entry.slug === slug)
        if (scene === undefined) {
          return null
        }
        return (
          <Sequence
            key={slug}
            from={Math.round(scene.from * fps)}
            durationInFrames={Math.max(1, scene.frames)}
            name={name}
          >
            <Component {...props} />
          </Sequence>
        )
      })}
    </FilmShell>
  )
}
