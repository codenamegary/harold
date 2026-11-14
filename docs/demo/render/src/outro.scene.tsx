import { AbsoluteFill, interpolate, useCurrentFrame, useVideoConfig } from "remotion"
import { useMemo } from "react"
import { FontLoader, sansFamily } from "./fonts"
import { Music } from "./music"
import { outroCameraAt, outroLightAt, outroPoseAt } from "./outro"
import { Slide } from "./slides"
import { StageScene } from "./stage.scene"
import { buildTimeline, phoneLayers, type DemoProps } from "./timeline"
import { ink } from "./theme"

type OutroProps = DemoProps & {
  /** Keep phone freeze frames local so a short preview composition does not clamp them. */
  localFreeze?: boolean
}

const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const

/**
 * The outro act. Camera, light, and body live in `outro.ts`. The card is the
 * outro slide, drawn inside the stage so it sits in the same light as the rest
 * of the film. The phone has no layers, so it is not drawn.
 */
export const Outro: React.FC<OutroProps> = ({
  slices,
  videoWidth,
  videoHeight,
  localFreeze = false,
}) => {
  const frame = useCurrentFrame()
  const { fps, width } = useVideoConfig()
  const localSec = frame / fps
  const timeline = useMemo(() => buildTimeline(slices), [slices])
  const scene = timeline.scenes.find((entry) => entry.slug === "outro")
  const originSec = scene?.from ?? 0
  const durationSec = scene === undefined ? 0 : scene.to - scene.from
  const endSec = originSec + durationSec
  const sec = originSec + localSec
  const camera = outroCameraAt(localSec)

  return (
    <StageScene
      videoWidth={videoWidth}
      videoHeight={videoHeight}
      sec={sec}
      light={outroLightAt(localSec)}
      camera={camera}
      drift={timeline.driftAt(sec, width)}
      body={outroPoseAt()}
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
    >
      <Slide
        variant="outro"
        sec={localSec}
        opacity={interpolate(localSec, [0, 0.6], [0, 1], clamp)}
      />
    </StageScene>
  )
}

export const OutroFilm: React.FC<DemoProps> = (props) => (
  <AbsoluteFill style={{ background: ink, fontFamily: sansFamily }}>
    <FontLoader />
    <Music />
    <Outro {...props} localFreeze />
  </AbsoluteFill>
)
