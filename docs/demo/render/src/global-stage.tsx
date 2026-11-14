import { createContext, useContext } from "react"
import { useVideoConfig } from "remotion"
import { VIDEO } from "./capture"
import {
  phoneLayout,
  worldView,
  type CameraState,
  type Point,
} from "./camera"
import { SCREEN_VIEW, type LightNow, type WorldView } from "./stage"
import { driftAt } from "./timeline"

const NO_DRIFT: Point = { x: 0, y: 0 }

export type Stage = {
  videoWidth: number
  videoHeight: number
  stageWidth: number
  stageHeight: number
  /** Local seconds for the phone, copy, sounds, and effects. */
  sec: number
  /** Global seconds for the ambient stage: drift, beam, and haze. */
  globalSec: number
  camera: CameraState
  light: LightNow
  drift: Point
  view: WorldView
}

const FilmClock = createContext(0)

/** The scene's start in the film. The only global input the stage needs. */
export const FilmClockProvider: React.FC<{
  startSec: number
  children: React.ReactNode
}> = ({ startSec, children }) => (
  <FilmClock.Provider value={startSec}>{children}</FilmClock.Provider>
)

export const useFilmClock = (): number => useContext(FilmClock)

export const stageView = (
  camera: CameraState,
  worldLock: CameraState | undefined,
  videoWidth: number,
  videoHeight: number,
  stageWidth: number,
  stageHeight: number,
): WorldView =>
  worldLock === undefined
    ? SCREEN_VIEW
    : worldView(
        phoneLayout(camera, videoWidth, videoHeight, stageWidth, stageHeight, NO_DRIFT),
        phoneLayout(worldLock, videoWidth, videoHeight, stageWidth, stageHeight, NO_DRIFT),
      )

/**
 * The machinery for one scene. The scene supplies its camera and light
 * direction. The hook supplies the stage dimensions, the seat in the film, and
 * the ambient drift.
 */
export const useGlobalStage = ({
  localSec,
  camera,
  light,
  worldLock,
}: {
  localSec: number
  camera: CameraState
  light: LightNow
  worldLock?: CameraState
}): Stage => {
  const startSec = useFilmClock()
  const { width, height } = useVideoConfig()
  const globalSec = startSec + localSec
  const drift = driftAt(globalSec, width)
  return {
    videoWidth: VIDEO.width,
    videoHeight: VIDEO.height,
    stageWidth: width,
    stageHeight: height,
    sec: localSec,
    globalSec,
    camera,
    light,
    drift,
    view: stageView(camera, worldLock, VIDEO.width, VIDEO.height, width, height),
  }
}

const StageContext = createContext<Stage | null>(null)

export const StageProvider: React.FC<{
  value: Stage
  children: React.ReactNode
}> = ({ value, children }) => (
  <StageContext.Provider value={value}>{children}</StageContext.Provider>
)

export const useStage = (): Stage => {
  const stage = useContext(StageContext)
  if (stage === null) {
    throw new Error("useStage must be used inside a StageProvider")
  }
  return stage
}
