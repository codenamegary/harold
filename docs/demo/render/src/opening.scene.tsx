import { AbsoluteFill, Easing, interpolate, Sequence, useCurrentFrame, useVideoConfig } from "remotion"
import { useMemo } from "react"
import { addPose } from "./body"
import { FontLoader, sansFamily } from "./fonts"
import { Music } from "./music"
import {
  FILLED,
  INTRO_SEC,
  LOCKUP_FADE_SEC,
  LOCKUP_IN_SEC,
  LOCKUP_OUT_SEC,
  openingCameraAt,
  openingIdleGainAt,
  openingLightAt,
  openingPoseAt,
  openingWaddleAt,
} from "./opening"
import { Slide } from "./slides"
import { StageScene } from "./stage.scene"
import { buildTimeline, driftAt, phoneLayers, type DemoProps } from "./timeline"
import { ink } from "./theme"

const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const
const leave = Easing.bezier(0.4, 0, 0.7, 0.2)

/**
 * The intro lockup. The mark lands once the lamp is up, the words and the CTA
 * follow, and the whole lockup lifts away as the pool starts to move.
 */
export const IntroLockup: React.FC = () => {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()
  const out = [LOCKUP_OUT_SEC * fps, (LOCKUP_OUT_SEC + LOCKUP_FADE_SEC) * fps]
  return (
    <AbsoluteFill
      style={{
        opacity: interpolate(frame, out, [1, 0], clamp),
        translate: interpolate(frame, out, ["0px 0px", "0px -22px"], { ...clamp, easing: leave }),
        filter: `blur(${interpolate(frame, out, [0, 8], { ...clamp, easing: leave })}px)`,
      }}
    >
      <Slide variant="intro" sec={frame / fps - LOCKUP_IN_SEC} opacity={1} />
    </AbsoluteFill>
  )
}

/**
 * Intro lockup, then the SSH walk-on. One stage. Camera, light, and body live
 * in this act, not in the scene table. The world is locked to the filled
 * frame, so the wide shot sees the same stage from further back and the
 * push-in carries the floor, the pool and the shaft with the phone.
 */
export const Opening: React.FC<DemoProps> = ({ slices, videoWidth, videoHeight }) => {
  const frame = useCurrentFrame()
  const { fps, width, height } = useVideoConfig()
  const sec = frame / fps
  const timeline = useMemo(() => buildTimeline(slices), [slices])
  const hinge = timeline.scenes.find((scene) => scene.slug === "achievement")
  const until = hinge?.from ?? INTRO_SEC
  const stand = openingPoseAt(sec)

  return (
    <StageScene
      videoWidth={videoWidth}
      videoHeight={videoHeight}
      sec={sec}
      light={openingLightAt(sec, {
        stageWidth: width,
        stageHeight: height,
        videoWidth,
        videoHeight,
      })}
      camera={openingCameraAt(sec)}
      worldLock={FILLED}
      drift={driftAt(sec, width)}
      body={addPose(stand, openingWaddleAt(sec))}
      ground={stand.y}
      idleGain={openingIdleGainAt(sec)}
      layers={phoneLayers(timeline.clips, sec)}
      ripples={timeline.ripples}
      copy={timeline.copy.filter((item) => item.at < until)}
      sounds={timeline.sounds.filter((sound) => sound.at < until)}
      soundOriginSec={0}
      celebrations={[]}
      confetti={[]}
      phoneFade={[[0, 1]]}
    >
      <Sequence
        durationInFrames={Math.ceil((LOCKUP_OUT_SEC + LOCKUP_FADE_SEC) * fps)}
        name="Intro lockup"
        layout="none"
      >
        <IntroLockup />
      </Sequence>
    </StageScene>
  )
}

export const OpeningFilm: React.FC<DemoProps> = (props) => (
  <AbsoluteFill style={{ background: ink, fontFamily: sansFamily }}>
    <FontLoader />
    <Music />
    <Opening {...props} />
  </AbsoluteFill>
)
