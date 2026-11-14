import { useCurrentFrame, useVideoConfig } from "remotion"
import { idleGainForScale } from "./body"
import {
  achievementCameraAt,
  achievementLightAt,
  achievementPoseAt,
} from "./achievement"
import { ACHIEVEMENT_CUT, ACHIEVEMENT_DURATION } from "./achievement.cut"
import { FilmClockProvider, StageProvider, useGlobalStage } from "./global-stage"
import { FilmShell } from "./film"
import { OPENING_DURATION } from "./opening.cut"
import { FrontStage, PhoneStage, StageFrame, phonePlacement } from "./stage.scene"
import { FPS, phoneLayers } from "./timeline"

/**
 * The achievement's local performance. It starts on the home screen, owns its
 * copy and the film's only celebration, and cues the global stage.
 */
export const AchievementScene: React.FC = () => {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()
  const localSec = frame / fps
  const layers = phoneLayers(ACHIEVEMENT_CUT.clips, localSec)

  const stage = useGlobalStage({
    localSec,
    camera: achievementCameraAt(localSec),
    light: achievementLightAt(localSec),
  })

  const placement = phonePlacement(stage, {
    body: achievementPoseAt(localSec, ACHIEVEMENT_DURATION / fps),
    idleGain: idleGainForScale(stage.camera.scale),
    layers,
    phoneFade: ACHIEVEMENT_CUT.phoneFade,
    ripples: ACHIEVEMENT_CUT.ripples,
    celebrations: ACHIEVEMENT_CUT.celebrations,
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
            copy={ACHIEVEMENT_CUT.copy}
            sounds={ACHIEVEMENT_CUT.sounds}
            confetti={ACHIEVEMENT_CUT.confetti}
          />
        }
      />
    </StageProvider>
  )
}

export const AchievementFilm: React.FC = () => (
  <FilmShell>
    <FilmClockProvider startSec={OPENING_DURATION / FPS}>
      <AchievementScene />
    </FilmClockProvider>
  </FilmShell>
)
