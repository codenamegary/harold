import { Audio, Sequence, staticFile, useVideoConfig } from "remotion"
import { addPose, idleAt, scalePose, type Pose } from "./body"
import { phoneDriftGain, phoneLayout, worldView, type CameraState, type Point } from "./camera"
import { celebrationStyle } from "./celebration"
import { ConfettiLayer } from "./confetti"
import { CalloutView, CapView, CardView, NoteView, SpotlightView, BoxView } from "./copy"
import { PhoneView, rimLevels, rippleProgress } from "./phone"
import { parallax, SCREEN_VIEW, type LightNow } from "./stage"
import {
  ContactShadow,
  PoolGlow,
  StageBack,
  StageBeam,
  StageFloor,
  StageGrade,
  StageHaze,
  StageWorld,
} from "./stage-view"
import {
  channel,
  type Celebration,
  type Confetti,
  type CopyItem,
  type Keyframes,
  type PhoneLayer,
  type Ripple,
  type Sound,
} from "./timeline"

const NO_DRIFT: Point = { x: 0, y: 0 }

export type StageSceneProps = {
  videoWidth: number
  videoHeight: number
  sec: number
  light: LightNow
  camera: CameraState
  /**
   * The framing the world is drawn for. When set, the floor, the pool and the
   * shaft follow the camera away from it, so a push-in moves the whole stage.
   * When not set, the world is drawn one to one and only the phone moves.
   */
  worldLock?: CameraState
  drift: Point
  /** Where the phone stands and how it holds itself. */
  body: Pose
  /** How much of `body.y` is travel across the floor. The rest is a hop. */
  ground?: number
  /** How much of the quiet idle walk rides on the body, 0..1. */
  idleGain: number
  layers: PhoneLayer[]
  ripples: Ripple[]
  copy: CopyItem[]
  sounds: Sound[]
  /** Subtracted from each sound time so a Sequence-local playhead stays in sync. */
  soundOriginSec: number
  celebrations: Celebration[]
  confetti: Confetti[]
  phoneFade: Keyframes
  children?: React.ReactNode
}

/**
 * The shared stage. Floor, pool, shaft, phone, dust, copy, and taps all draw
 * here. Acts pass camera, light, and body. They do not draw a second world.
 */
export const StageScene: React.FC<StageSceneProps> = ({
  videoWidth,
  videoHeight,
  sec,
  light,
  camera,
  worldLock,
  drift,
  body,
  ground = 0,
  idleGain,
  layers,
  ripples,
  copy,
  sounds,
  soundOriginSec,
  celebrations,
  confetti,
  phoneFade,
  children,
}) => {
  const { fps, width: stageW, height: stageH } = useVideoConfig()
  const driftGain = phoneDriftGain(camera.scale)
  const phoneDrift = { x: drift.x * driftGain, y: drift.y * driftGain }
  const layout = phoneLayout(camera, videoWidth, videoHeight, stageW, stageH, phoneDrift)
  const view =
    worldLock === undefined
      ? SCREEN_VIEW
      : worldView(
          phoneLayout(camera, videoWidth, videoHeight, stageW, stageH, NO_DRIFT),
          phoneLayout(worldLock, videoWidth, videoHeight, stageW, stageH, NO_DRIFT),
        )
  const phoneOpacity = layers.length === 0 ? 0 : channel(phoneFade, sec)
  const pose = addPose(body, scalePose(idleAt(sec), idleGain))
  const pop = celebrationStyle(celebrations, sec)

  // The pool as the screen sees it, so the phone knows how the light falls on it.
  const poolX = view.x + (light.shape.centreX * stageW + parallax("pool", drift.x)) * view.scale
  const poolY = view.y + light.shape.centreY * stageH * view.scale
  const poolRx = light.shape.radiusX * stageW * view.scale
  const poolRy = light.shape.radiusY * stageH * view.scale
  const feetX = layout.left + layout.width / 2 + pose.x + pop.x
  const feetY = layout.top + layout.height + ground
  const fromPoolX = (feetX - poolX) / poolRx
  const fromPoolY = (feetY - poolY) / poolRy
  const floorLit = Math.max(0, 1 - Math.sqrt(fromPoolX * fromPoolX + fromPoolY * fromPoolY))
  const rims = rimLevels({
    poolX,
    poolRadius: poolRx,
    phoneCenter: feetX,
    phoneWidth: layout.width,
  })
  const liveRipples = ripples
    .map((ripple) => ({ ...ripple, progress: rippleProgress(sec, ripple.at) }))
    .filter((ripple) => ripple.progress > 0 && ripple.progress < 1)

  return (
    <>
      <StageBack />
      <StageWorld view={view}>
        <StageFloor light={light} drift={drift.x} />
        <PoolGlow light={light} drift={drift.x} />
        <StageBeam light={light} drift={drift.x} sec={sec} />
      </StageWorld>
      <StageGrade />
      <ContactShadow
        layout={layout}
        x={pose.x + pop.x}
        y={ground}
        lift={Math.max(0, ground - (pose.y + pop.y))}
        scale={pose.scale}
        lit={floorLit}
        lean={Math.min(1, Math.max(-1, fromPoolX))}
        opacity={phoneOpacity}
      />
      {copy
        .filter((item) => item.kind === "note")
        .map((item) => (
          <NoteView key={`note-${item.at}`} item={item} sec={sec} layout={layout} />
        ))}
      <PhoneView
        layout={layout}
        layers={layers}
        sec={sec}
        ripples={liveRipples}
        pose={pose}
        pop={pop}
        opacity={phoneOpacity}
        light={light}
        rims={rims}
      />
      <StageWorld view={view}>
        <StageHaze light={light} drift={drift.x} sec={sec} depth={view.scale} />
      </StageWorld>
      <ConfettiLayer bursts={confetti} sec={sec} light={light.shape} />
      {copy.map((item, index) => {
        switch (item.kind) {
          case "card":
            return <CardView key={`card-${index}`} item={item} sec={sec} layout={layout} />
          case "callout":
            return <CalloutView key={`callout-${index}`} item={item} sec={sec} layout={layout} />
          case "spotlight":
            return <SpotlightView key={`spot-${index}`} item={item} sec={sec} />
          case "box":
            return <BoxView key={`box-${index}`} item={item} sec={sec} layout={layout} />
          case "cap":
            return <CapView key={`cap-${index}`} item={item} sec={sec} />
          case "note":
            return null
        }
      })}
      {children}
      {sounds.map((sound, index) => (
        <Sequence key={`sfx-${index}`} from={Math.round((sound.at - soundOriginSec) * fps)}>
          <Audio src={staticFile(`sfx/${sound.name}.wav`)} volume={sound.volume} />
        </Sequence>
      ))}
    </>
  )
}
