import { interpolate, useCurrentFrame, useVideoConfig } from "remotion"
import { useMemo } from "react"
import { addPose, idleGainForScale, waddleAt, type Pose } from "./body"
import { lightAt } from "./stage"
import { Slide } from "./slides"
import { StageScene } from "./stage.scene"
import { buildTimeline, phoneLayers, type DemoProps } from "./timeline"

const NO_WADDLE: Pose = { x: 0, y: 0, rotateZ: 0, rotateY: 0, rotateX: 0, scale: 1 }

/**
 * Everything after the opening and achievement acts. Still cut from the scene
 * table. Local frame 0 is the new session, so full-timeline times are offset.
 */
export const Work: React.FC<DemoProps> = ({ slices, videoWidth, videoHeight }) => {
  const frame = useCurrentFrame()
  const { fps, width } = useVideoConfig()
  const timeline = useMemo(() => buildTimeline(slices), [slices])
  const newSession = timeline.scenes.find((scene) => scene.slug === "newSession")
  const originSec = newSession?.from ?? 0
  const sec = originSec + frame / fps
  const layers = phoneLayers(timeline.clips, sec)
  const light = lightAt(timeline.lights, sec)
  const camera = timeline.cameraAt(sec)
  const drift = timeline.driftAt(sec, width)
  const waddle = timeline.waddles.find((cue) => sec >= cue.at && sec <= cue.at + cue.duration)
  const body = addPose(
    timeline.poseAt(sec),
    waddle === undefined ? NO_WADDLE : waddleAt(waddle, sec),
  )
  const outro = timeline.scenes[timeline.scenes.length - 1]
  const outroOpacity = interpolate(sec, [outro.from, outro.from + 0.6], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  })

  return (
    <StageScene
      videoWidth={videoWidth}
      videoHeight={videoHeight}
      sec={sec}
      light={light}
      camera={camera}
      drift={drift}
      body={body}
      idleGain={timeline.idleFrozenAt(sec) ? 0 : idleGainForScale(camera.scale)}
      layers={layers}
      ripples={timeline.ripples}
      copy={timeline.copy.filter((item) => item.at >= originSec)}
      sounds={timeline.sounds.filter((sound) => sound.at >= originSec)}
      soundOriginSec={originSec}
      celebrations={timeline.celebrations}
      confetti={timeline.confetti}
      phoneFade={timeline.phoneFade}
    >
      {sec >= outro.from ? (
        <Slide variant="outro" sec={sec - outro.from} opacity={outroOpacity} />
      ) : null}
    </StageScene>
  )
}
