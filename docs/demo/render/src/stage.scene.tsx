import { Audio, Sequence, staticFile, useVideoConfig } from "remotion"
import { addPose, idleAt, scalePose, type Pose } from "./body"
import { phoneDriftGain, phoneLayout, type CameraState, type PhoneLayout, type Point } from "./camera"
import { celebrationStyle, type CelebrationStyle } from "./celebration"
import { ConfettiLayer } from "./confetti"
import { CalloutView, CapView, CardView, NoteView, SpotlightView, BoxView } from "./copy"
import {
  stageView,
  useStage,
  StageProvider,
  type Stage,
} from "./global-stage"
import { PhoneView, rimLevels, rippleProgress, type RippleSpec } from "./phone"
import { parallax, type LightNow } from "./stage"
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
  /** Multiplies the phone's share of the camera drift. Acts that hold still pass 0. */
  phoneDriftFactor?: number
  /** Keep phone freeze frames local so a short preview composition does not clamp them. */
  localFreeze?: boolean
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

export type PhonePlacement = {
  layout: PhoneLayout
  pose: Pose
  pop: CelebrationStyle
  phoneOpacity: number
  ground: number
  floorLit: number
  fromPoolX: number
  rims: ReturnType<typeof rimLevels>
  liveRipples: RippleSpec[]
}

export type PhonePlacementProps = {
  body: Pose
  ground?: number
  idleGain: number
  phoneDriftFactor?: number
  layers: PhoneLayer[]
  phoneFade: Keyframes
  ripples?: Ripple[]
  celebrations?: Celebration[]
}

/**
 * The phone's position, pose, and light response. Pure: the stage provides the
 * camera, light, and drift. The scene provides the performance.
 */
export const phonePlacement = (
  stage: Stage,
  {
    body,
    ground = 0,
    idleGain,
    phoneDriftFactor = 1,
    layers,
    phoneFade,
    ripples = [],
    celebrations = [],
  }: PhonePlacementProps,
): PhonePlacement => {
  const driftGain = phoneDriftGain(stage.camera.scale) * phoneDriftFactor
  const phoneDrift = { x: stage.drift.x * driftGain, y: stage.drift.y * driftGain }
  const layout = phoneLayout(
    stage.camera,
    stage.videoWidth,
    stage.videoHeight,
    stage.stageWidth,
    stage.stageHeight,
    phoneDrift,
  )
  const phoneOpacity = layers.length === 0 ? 0 : channel(phoneFade, stage.sec)
  const pose = addPose(body, scalePose(idleAt(stage.sec), idleGain))
  const pop = celebrationStyle(celebrations, stage.sec)

  // The pool as the screen sees it, so the phone knows how the light falls on it.
  const poolX =
    stage.view.x +
    (stage.light.shape.centreX * stage.stageWidth + parallax("pool", stage.drift.x)) *
      stage.view.scale
  const poolY = stage.view.y + stage.light.shape.centreY * stage.stageHeight * stage.view.scale
  const poolRx = stage.light.shape.radiusX * stage.stageWidth * stage.view.scale
  const poolRy = stage.light.shape.radiusY * stage.stageHeight * stage.view.scale
  const feetX = layout.left + layout.width / 2 + pose.x + pop.x
  const feetY = layout.top + layout.height + ground
  const fromPoolX = (feetX - poolX) / poolRx
  const fromPoolY = (feetY - poolY) / poolRy
  const floorLit = Math.max(
    0,
    1 - Math.sqrt(fromPoolX * fromPoolX + fromPoolY * fromPoolY),
  )
  const rims = rimLevels({
    poolX,
    poolRadius: poolRx,
    phoneCenter: feetX,
    phoneWidth: layout.width,
  })
  const liveRipples = ripples
    .map((ripple) => ({ ...ripple, progress: rippleProgress(stage.sec, ripple.at) }))
    .filter((ripple) => ripple.progress > 0 && ripple.progress < 1)

  return {
    layout,
    pose,
    pop,
    phoneOpacity,
    ground,
    floorLit,
    fromPoolX,
    rims,
    liveRipples,
  }
}

/** The shared stage machinery, in the film's z-order. */
export const StageFrame: React.FC<{
  phone: React.ReactNode
  front: React.ReactNode
}> = ({ phone, front }) => {
  const stage = useStage()
  return (
    <>
      <StageBack />
      <StageWorld view={stage.view}>
        <StageFloor light={stage.light} drift={stage.drift.x} />
        <PoolGlow light={stage.light} drift={stage.drift.x} />
        <StageBeam light={stage.light} drift={stage.drift.x} sec={stage.globalSec} />
      </StageWorld>
      <StageGrade />
      {phone}
      <StageWorld view={stage.view}>
        <StageHaze
          light={stage.light}
          drift={stage.drift.x}
          sec={stage.globalSec}
          depth={stage.view.scale}
        />
      </StageWorld>
      {front}
    </>
  )
}

/** The phone and the copy notes that sit under it. */
export const PhoneStage: React.FC<{
  placement: PhonePlacement
  layers: PhoneLayer[]
  copy?: CopyItem[]
  localFreeze?: boolean
}> = ({ placement, layers, copy = [], localFreeze = false }) => {
  const stage = useStage()
  return (
    <>
      <ContactShadow
        layout={placement.layout}
        x={placement.pose.x + placement.pop.x}
        y={placement.ground}
        lift={Math.max(0, placement.ground - (placement.pose.y + placement.pop.y))}
        scale={placement.pose.scale}
        lit={placement.floorLit}
        lean={Math.min(1, Math.max(-1, placement.fromPoolX))}
        opacity={placement.phoneOpacity}
      />
      {copy
        .filter((item) => item.kind === "note")
        .map((item) => (
          <NoteView key={`note-${item.at}`} item={item} sec={stage.sec} layout={placement.layout} />
        ))}
      <PhoneView
        layout={placement.layout}
        layers={layers}
        sec={stage.sec}
        ripples={placement.liveRipples}
        pose={placement.pose}
        pop={placement.pop}
        opacity={placement.phoneOpacity}
        light={stage.light}
        rims={placement.rims}
        localFreeze={localFreeze}
      />
    </>
  )
}

/** The copy and effects that sit above the haze. */
export const FrontStage: React.FC<{
  placement: PhonePlacement
  copy?: CopyItem[]
  sounds?: Sound[]
  confetti?: Confetti[]
  soundOriginSec?: number
  children?: React.ReactNode
}> = ({ placement, copy = [], sounds = [], confetti = [], soundOriginSec = 0, children }) => {
  const stage = useStage()
  const { fps } = useVideoConfig()
  return (
    <>
      <ConfettiLayer bursts={confetti} sec={stage.sec} light={stage.light.shape} />
      {copy.map((item, index) => {
        switch (item.kind) {
          case "card":
            return <CardView key={`card-${index}`} item={item} sec={stage.sec} layout={placement.layout} />
          case "callout":
            return <CalloutView key={`callout-${index}`} item={item} sec={stage.sec} layout={placement.layout} />
          case "spotlight":
            return <SpotlightView key={`spot-${index}`} item={item} sec={stage.sec} />
          case "box":
            return <BoxView key={`box-${index}`} item={item} sec={stage.sec} layout={placement.layout} />
          case "cap":
            return <CapView key={`cap-${index}`} item={item} sec={stage.sec} />
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

/**
 * The compatibility stage for the scenes that still use the global timeline.
 * New scenes use `useGlobalStage` directly.
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
  phoneDriftFactor = 1,
  localFreeze = false,
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
  const { width: stageWidth, height: stageHeight } = useVideoConfig()
  const stage: Stage = {
    videoWidth,
    videoHeight,
    stageWidth,
    stageHeight,
    sec,
    globalSec: sec,
    camera,
    light,
    drift,
    view: stageView(camera, worldLock, videoWidth, videoHeight, stageWidth, stageHeight),
  }
  const placement = phonePlacement(stage, {
    body,
    ground,
    idleGain,
    phoneDriftFactor,
    layers,
    phoneFade,
    ripples,
    celebrations,
  })

  return (
    <StageProvider value={stage}>
      <StageFrame
        phone={
          <PhoneStage
            placement={placement}
            layers={layers}
            copy={copy}
            localFreeze={localFreeze}
          />
        }
        front={
          <FrontStage
            placement={placement}
            copy={copy}
            sounds={sounds}
            confetti={confetti}
            soundOriginSec={soundOriginSec}
          >
            {children}
          </FrontStage>
        }
      />
    </StageProvider>
  )
}
