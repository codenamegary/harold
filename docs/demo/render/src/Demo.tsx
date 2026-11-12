import { AbsoluteFill, Sequence, useVideoConfig } from "remotion"
import { useMemo } from "react"
import { Achievement } from "./achievement.scene"
import { FontLoader, sansFamily } from "./fonts"
import { Music } from "./music"
import { NewSession } from "./newSession.scene"
import { Opening } from "./opening.scene"
import { buildTimeline, type DemoProps } from "./timeline"
import { ink } from "./theme"
import { Work } from "./work.scene"

export const Demo: React.FC<DemoProps> = (props) => {
  const { fps } = useVideoConfig()
  const timeline = useMemo(() => buildTimeline(props.slices), [props.slices])
  const achievement = timeline.scenes.find((scene) => scene.slug === "achievement")
  const newSession = timeline.scenes.find((scene) => scene.slug === "newSession")
  const openingFrames = Math.max(1, Math.round((achievement?.from ?? 0) * fps))
  const achievementFrames = Math.max(1, achievement?.frames ?? 1)
  const newSessionFrames = Math.max(1, newSession?.frames ?? 1)

  return (
    <AbsoluteFill style={{ background: ink, fontFamily: sansFamily }}>
      <FontLoader />
      <Music />
      <Sequence durationInFrames={openingFrames} name="Opening">
        <Opening {...props} />
      </Sequence>
      <Sequence
        from={openingFrames}
        durationInFrames={achievementFrames}
        name="Achievement"
      >
        <Achievement {...props} />
      </Sequence>
      <Sequence
        from={openingFrames + achievementFrames}
        durationInFrames={newSessionFrames}
        name="New Session"
      >
        <NewSession {...props} />
      </Sequence>
      <Sequence from={openingFrames + achievementFrames + newSessionFrames} name="Work">
        <Work {...props} />
      </Sequence>
    </AbsoluteFill>
  )
}
