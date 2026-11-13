import {
  AbsoluteFill,
  Easing,
  interpolate,
  Sequence,
  useCurrentFrame,
  useVideoConfig,
} from "remotion"
import { addPose } from "./body"
import { VIDEO } from "./capture"
import { FilmClockProvider, StageProvider, useGlobalStage } from "./global-stage"
import { FilmShell } from "./film"
import {
  FILLED,
  LOCKUP_FADE_SEC,
  LOCKUP_IN_SEC,
  LOCKUP_OUT_SEC,
  openingCameraAt,
  openingIdleGainAt,
  openingLightAt,
  openingPoseAt,
  openingWaddleAt,
} from "./opening"
import { OPENING_CUT } from "./opening.cut"
import { Slide } from "./slides"
import { FrontStage, PhoneStage, StageFrame, phonePlacement } from "./stage.scene"
import { phoneLayers } from "./timeline"

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
 * The opening's local performance. The intro lockup is a local overlay, the
 * SSH walk is local, and the camera and light are the scene's direction for the
 * global stage machinery.
 */
export const OpeningScene: React.FC = () => {
  const frame = useCurrentFrame()
  const { fps, width, height } = useVideoConfig()
  const localSec = frame / fps
  const stand = openingPoseAt(localSec)
  const body = addPose(stand, openingWaddleAt(localSec))
  const layers = phoneLayers(OPENING_CUT.clips, localSec)

  const stage = useGlobalStage({
    localSec,
    camera: openingCameraAt(localSec),
    light: openingLightAt(localSec, {
      stageWidth: width,
      stageHeight: height,
      videoWidth: VIDEO.width,
      videoHeight: VIDEO.height,
    }),
    worldLock: FILLED,
  })

  const placement = phonePlacement(stage, {
    body,
    ground: stand.y,
    idleGain: openingIdleGainAt(localSec),
    layers,
    phoneFade: OPENING_CUT.phoneFade,
    ripples: OPENING_CUT.ripples,
  })

  return (
    <StageProvider value={stage}>
      <StageFrame
        phone={
          <PhoneStage placement={placement} layers={layers} />
        }
        front={
          <FrontStage
            placement={placement}
            copy={OPENING_CUT.copy}
            sounds={OPENING_CUT.sounds}
          >
            <Sequence
              durationInFrames={Math.ceil((LOCKUP_OUT_SEC + LOCKUP_FADE_SEC) * fps)}
              name="Intro lockup"
              layout="none"
            >
              <IntroLockup />
            </Sequence>
          </FrontStage>
        }
      />
    </StageProvider>
  )
}

export const OpeningFilm: React.FC = () => (
  <FilmShell>
    <FilmClockProvider startSec={0}>
      <OpeningScene />
    </FilmClockProvider>
  </FilmShell>
)
