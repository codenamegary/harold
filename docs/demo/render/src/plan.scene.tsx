import { AbsoluteFill, useCurrentFrame, useVideoConfig } from "remotion"
import { useMemo } from "react"
import { FontLoader, sansFamily } from "./fonts"
import { Music } from "./music"
import { planCameraAt, planLightAt, planPoseAt } from "./plan"
import { StageScene } from "./stage.scene"
import { buildTimeline, phoneLayers, type DemoProps } from "./timeline"
import { ink } from "./theme"

type PlanProps = DemoProps & {
  /** Keep phone freeze frames local so a short preview composition does not clamp them. */
  localFreeze?: boolean
}

/**
 * The plan act. Camera, light, and body live in `plan.ts`. Shots, copy, and
 * sound stay on the timeline, indexed by absolute time from the cut.
 */
export const Plan: React.FC<PlanProps> = ({
  slices,
  videoWidth,
  videoHeight,
  localFreeze = false,
}) => {
  const frame = useCurrentFrame()
  const { fps, width } = useVideoConfig()
  const localSec = frame / fps
  const timeline = useMemo(() => buildTimeline(slices), [slices])
  const scene = timeline.scenes.find((entry) => entry.slug === "plan")
  const originSec = scene?.from ?? 0
  const durationSec = scene === undefined ? 0 : scene.to - scene.from
  const endSec = originSec + durationSec
  const sec = originSec + localSec
  const camera = planCameraAt(localSec)

  return (
    <StageScene
      videoWidth={videoWidth}
      videoHeight={videoHeight}
      sec={sec}
      light={planLightAt(localSec)}
      camera={camera}
      drift={timeline.driftAt(sec, width)}
      body={planPoseAt(localSec)}
      idleGain={0}
      phoneDriftFactor={0}
      localFreeze={localFreeze}
      layers={phoneLayers(timeline.clips, sec)}
      ripples={timeline.ripples}
      copy={timeline.copy.filter((item) => item.at >= originSec && item.at < endSec)}
      sounds={timeline.sounds.filter((sound) => sound.at >= originSec && sound.at < endSec)}
      soundOriginSec={originSec}
      celebrations={timeline.celebrations.filter(
        (item) => item.at >= originSec && item.at < endSec,
      )}
      confetti={timeline.confetti.filter((item) => item.at >= originSec && item.at < endSec)}
      phoneFade={[[0, 1]]}
    />
  )
}

export const PlanFilm: React.FC<DemoProps> = (props) => (
  <AbsoluteFill style={{ background: ink, fontFamily: sansFamily }}>
    <FontLoader />
    <Music />
    <Plan {...props} localFreeze />
  </AbsoluteFill>
)
