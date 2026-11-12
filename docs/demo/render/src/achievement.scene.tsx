import { AbsoluteFill, useCurrentFrame, useVideoConfig } from "remotion"
import { useMemo } from "react"
import {
  achievementCameraAt,
  achievementLightAt,
  achievementPoseAt,
} from "./achievement"
import { idleGainForScale } from "./body"
import { FontLoader, sansFamily } from "./fonts"
import { Music } from "./music"
import { StageScene } from "./stage.scene"
import { buildTimeline, phoneLayers, type DemoProps, type PhoneClip } from "./timeline"
import { ink } from "./theme"

type AchievementProps = DemoProps & {
  /** Show the landing screen from the start. The standalone preview uses this. */
  preview?: boolean
}

/**
 * The achievement act. Camera, light, and body live in `achievement.ts`.
 * Shots, copy, sound, and the one celebration stay on the timeline, indexed by
 * absolute time from the cut.
 */
export const Achievement: React.FC<AchievementProps> = ({
  slices,
  videoWidth,
  videoHeight,
  preview = false,
}) => {
  const frame = useCurrentFrame()
  const { fps, width } = useVideoConfig()
  const localSec = frame / fps
  const timeline = useMemo(() => buildTimeline(slices), [slices])
  const scene = timeline.scenes.find((entry) => entry.slug === "achievement")
  const originSec = scene?.from ?? 0
  const durationSec = scene === undefined ? 0 : scene.to - scene.from
  const endSec = originSec + durationSec
  const sec = originSec + localSec
  const camera = achievementCameraAt(localSec)
  const clips = useMemo<PhoneClip[]>(() => {
    if (!preview || scene === undefined) {
      return timeline.clips
    }
    const landing = timeline.shots.find(
      (shot) => shot.scene === "achievement" && shot.slice === "landing",
    )
    if (landing === undefined) {
      return timeline.clips
    }
    const chatAt = landing.data.marks?.find((mark) => mark.name === "chat_visible")?.atSec ?? 0
    const playSec = Math.max(0, Math.min(scene.to - scene.from, landing.data.durationSec - chatAt))
    return [
      {
        kind: "play",
        file: landing.data.file,
        from: scene.from,
        duration: playSec,
        rate: 1,
        startSec: chatAt,
      },
      {
        kind: "hold",
        file: landing.data.file,
        from: scene.from + playSec,
        duration: Math.max(0, scene.to - scene.from - playSec),
        atSec: landing.data.durationSec,
      },
    ]
  }, [preview, scene, timeline])

  return (
    <StageScene
      videoWidth={videoWidth}
      videoHeight={videoHeight}
      sec={sec}
      light={achievementLightAt(localSec)}
      camera={camera}
      drift={timeline.driftAt(sec, width)}
      body={achievementPoseAt(localSec, durationSec)}
      idleGain={idleGainForScale(camera.scale)}
      localFreeze={preview}
      layers={phoneLayers(clips, sec)}
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

export const AchievementFilm: React.FC<DemoProps> = (props) => (
  <AbsoluteFill style={{ background: ink, fontFamily: sansFamily }}>
    <FontLoader />
    <Music />
    <Achievement {...props} preview />
  </AbsoluteFill>
)
