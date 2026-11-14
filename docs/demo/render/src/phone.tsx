import { Freeze, OffthreadVideo, Sequence, staticFile, useVideoConfig } from "remotion"
import type { Pose } from "./body"
import type { PhoneLayout } from "./camera"
import type { CelebrationStyle } from "./celebration"
import type { LightNow } from "./stage"
import { clipFrame, rippleColor, rippleDuration, type PhoneLayer } from "./timeline"
import { line } from "./theme"

// The app pixels, exactly once. The body is decoration around it, and the ripples
// live inside it in the video's own coordinates, so a camera move can never slide
// them off the control they belong to.

const Ripple: React.FC<{ progress: number; size: number }> = ({ progress, size }) => (
  <>
    <div
      style={{
        position: "absolute",
        width: size,
        height: size,
        borderRadius: size / 2,
        border: `3px solid ${rippleColor}`,
        translate: "-50% -50%",
        scale: `${0.45 + progress * 0.85}`,
        opacity: 0.9 * (1 - progress),
      }}
    />
    <div
      style={{
        position: "absolute",
        width: size * 0.16,
        height: size * 0.16,
        borderRadius: size * 0.08,
        background: rippleColor,
        translate: "-50% -50%",
        scale: `${1 + progress * 1.4}`,
        opacity: 0.9 * (1 - progress),
      }}
    />
  </>
)

export type RippleSpec = { at: number; progress: number; x: number; y: number }

const Screen: React.FC<{
  layout: PhoneLayout
  layers: PhoneLayer[]
  sec: number
  ripples: RippleSpec[]
  /** Keep each freeze frame inside a local sequence. Short compositions need this. */
  localFreeze: boolean
}> = ({ layout, layers, sec, ripples, localFreeze }) => {
  const { fps } = useVideoConfig()
  return (
    <div
      style={{
        position: "relative",
        width: layout.width,
        height: layout.height,
        overflow: "hidden",
        background: "#000",
      }}
    >
      {layers.map((layer, index) => {
        const freezeFrame = Math.round(clipFrame(layer.clip, sec) * fps)
        const frozen = (
          <Freeze frame={freezeFrame}>
            <OffthreadVideo
              src={staticFile(layer.clip.file)}
              muted
              style={{ width: layout.width, height: layout.height }}
            />
          </Freeze>
        )
        return (
          <div
            key={`${layer.clip.file}-${layer.clip.from}-${index}`}
            style={{ position: "absolute", inset: 0, opacity: layer.opacity }}
          >
            {localFreeze ? (
              <Sequence from={-freezeFrame} layout="none">
                {frozen}
              </Sequence>
            ) : (
              frozen
            )}
          </div>
        )
      })}
      {ripples.map((ripple, index) => (
        <div
          key={index}
          style={{
            position: "absolute",
            left: ripple.x * layout.width,
            top: ripple.y * layout.height,
          }}
        >
          <Ripple progress={ripple.progress} size={Math.round(layout.width * 0.14)} />
        </div>
      ))}
    </div>
  )
}

const PHONE_RGB = "255, 255, 255"

/** One rim, on the edge that faces the pool. Brighter when the pool is. */
const rimAlpha = (light: LightNow): number =>
  Math.min(1, 0.08 + light.shape.intensity * 1.05)

/** How hard the light hits each edge of the handset, 0..1. */
export type RimLevels = { left: number; right: number }

export type RimLevelsParams = {
  poolX: number
  poolRadius: number
  phoneCenter: number
  phoneWidth: number
}

const unit = (value: number): number => Math.min(1, Math.max(0, value))

/**
 * A pool to one side of the handset lights that edge and leaves the other
 * dim. A pool under the phone lights both. A phone still out in the dark has
 * not earned the light yet, so both rims fall off with distance. The levels
 * are continuous, so a drifting phone never pops a rim on or off.
 */
export const rimLevels = (params: RimLevelsParams): RimLevels => {
  const { poolX, poolRadius, phoneCenter, phoneWidth } = params
  const offset = (poolX - phoneCenter) / phoneWidth
  const distance = Math.abs(poolX - phoneCenter) / poolRadius
  const reach = Math.min(1, Math.max(0.1, 1 - (distance - 1) / 1.4))
  return {
    left: unit(0.72 - offset * 0.8) * reach,
    right: unit(0.72 + offset * 0.8) * reach,
  }
}

const Rim: React.FC<{ side: "left" | "right"; alpha: number }> = ({ side, alpha }) => (
  <div
    style={{
      position: "absolute",
      top: "4%",
      bottom: "6%",
      ...(side === "left" ? { left: 0 } : { right: 0 }),
      width: 6,
      borderRadius: 6,
      background: `linear-gradient(180deg, transparent 0%, rgba(${PHONE_RGB},${alpha * 0.9}) 14%, rgba(${PHONE_RGB},${alpha * 0.9}) 78%, transparent 100%)`,
      boxShadow: `0 0 14px rgba(${PHONE_RGB},${alpha * 0.55})`,
      pointerEvents: "none",
    }}
  />
)

/**
 * The phone as an object on the stage. `pose` is the body language (waddle,
 * lean, turn to present) and `pop` is the one celebration squash. Both are
 * transforms, so they compose instead of fighting.
 */
export const PhoneView: React.FC<{
  layout: PhoneLayout
  layers: PhoneLayer[]
  sec: number
  ripples: RippleSpec[]
  pose: Pose
  pop: CelebrationStyle
  opacity: number
  light: LightNow
  rims: RimLevels
  localFreeze?: boolean
}> = ({ layout, layers, sec, ripples, pose, pop, opacity, light, rims, localFreeze = false }) => {
  const alpha = rimAlpha(light)
  return (
    <div
      style={{
        position: "absolute",
        left: layout.left - layout.bezel,
        top: layout.top - layout.bezel,
        width: layout.frameWidth,
        height: layout.frameHeight,
        perspective: 820,
        opacity,
        overflow: "visible",
      }}
    >
      <div
        style={{
          width: layout.frameWidth,
          height: layout.frameHeight,
          transformOrigin: "50% 100%",
          translate: `${pose.x + pop.x}px ${pose.y + pop.y}px`,
          scale: `${pose.scale * pop.scaleX} ${pose.scale * pop.scaleY}`,
          transform: `rotateX(${pose.rotateX}deg) rotateY(${pose.rotateY}deg) rotateZ(${pose.rotateZ + pop.rotate}deg)`,
        }}
      >
        <div
          style={{
            position: "relative",
            boxSizing: "border-box",
            width: layout.frameWidth,
            height: layout.frameHeight,
            padding: layout.bezel,
            borderRadius: Math.round(38 + layout.bezel * 0.6),
            background: "linear-gradient(160deg, #1D232C 0%, #141920 52%, #0E1216 100%)",
            boxShadow: `0 0 0 1px ${line}, 0 1px 0 rgba(255,255,255,0.08) inset`,
          }}
        >
          <div
            style={{
              width: layout.width,
              height: layout.height,
              borderRadius: Math.round(30 + layout.bezel * 0.5),
              overflow: "hidden",
            }}
          >
            <Screen
              layout={layout}
              layers={layers}
              sec={sec}
              ripples={ripples}
              localFreeze={localFreeze}
            />
          </div>
          {rims.left > 0.02 ? <Rim side="left" alpha={alpha * rims.left} /> : null}
          {rims.right > 0.02 ? <Rim side="right" alpha={alpha * rims.right} /> : null}
        </div>
      </div>
    </div>
  )
}

export const rippleProgress = (sec: number, at: number): number =>
  Math.min(1, Math.max(0, (sec - at) / rippleDuration))
