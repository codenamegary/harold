import { AbsoluteFill, Sequence, useVideoConfig } from "remotion"
import { useMemo } from "react"
import { FontLoader, sansFamily } from "./fonts"
import { Music } from "./music"
import { Opening } from "./opening.scene"
import { buildTimeline, type DemoProps } from "./timeline"
import { ink } from "./theme"
import { Work } from "./work.scene"

export const Demo: React.FC<DemoProps> = (props) => {
  const { fps } = useVideoConfig()
  const timeline = useMemo(() => buildTimeline(props.slices), [props.slices])
  const hinge = timeline.scenes.find((scene) => scene.slug === "achievement")
  const openingFrames = Math.max(1, Math.round((hinge?.from ?? 0) * fps))

  return (
    <AbsoluteFill style={{ background: ink, fontFamily: sansFamily }}>
      <FontLoader />
      <Music />
      <Sequence durationInFrames={openingFrames} name="Opening">
        <Opening {...props} />
      </Sequence>
      <Sequence from={openingFrames} name="Work">
        <Work {...props} />
      </Sequence>
    </AbsoluteFill>
  )
}
