import { Freeze, OffthreadVideo, staticFile, useVideoConfig } from "remotion"
import type { Pose } from "./body"
import type { PhoneLayout } from "./camera"
import type { CelebrationStyle } from "./celebration"
import type { LightNow } from "./stage"
import { clipFrame, rippleColor, rippleDuration, type PhoneClip } from "./timeline"
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
  clip: PhoneClip | null
  sec: number
  ripples: RippleSpec[]
}> = ({ layout, clip, sec, ripples }) => {
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
      {clip !== null ? (
        <Freeze frame={Math.round(clipFrame(clip, sec) * fps)}>
          <OffthreadVideo
            src={staticFile(clip.file)}
            muted
            style={{ width: layout.width, height: layout.height }}
          />
        </Freeze>
      ) : null}
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

/** The side of the handset the floodlight reaches. */
export type LitSide = "left" | "right"

const PHONE_RGB = "226, 236, 255"

/**
 * How the floodlight catches the handset. The edge is a thin rim on the side
 * facing the pool plus a wide falloff across the lit face, both keyed to the
 * light's own intensity and flare, so the body brightens with the pool instead
 * of sitting on top of it. Never a hard outline: the rim always carries blur.
 */
const phoneLit = (light: LightNow, litFrom: LitSide) => {
  const { shape } = light
  const strength = 0.05 + 0.5 * Math.pow(shape.intensity, 1.5)
  return {
    litFrom,
    edgeAlpha: Math.min(0.68, strength * 1.4),
    falloffAlpha: Math.min(0.22, strength * 0.5),
    // Flare widens the catch: tight on `work`, soft and wide on `full`.
    spread: 0.15 + shape.flare * 0.44,
    blur: 7 + shape.flare * 14,
  }
}

const edgeGradient = (alpha: number): string =>
  `linear-gradient(180deg, rgba(${PHONE_RGB},0) 0%, rgba(${PHONE_RGB},${alpha * 0.72}) 14%, rgba(${PHONE_RGB},${alpha}) 48%, rgba(${PHONE_RGB},${alpha * 0.84}) 78%, rgba(${PHONE_RGB},0) 100%)`

const falloffGradient = (alpha: number, litFrom: LitSide): string => {
  const stops = `rgba(${PHONE_RGB},${alpha}) 0%, rgba(${PHONE_RGB},${alpha * 0.48}) 34%, rgba(${PHONE_RGB},${alpha * 0.14}) 70%, rgba(${PHONE_RGB},0) 100%`
  return litFrom === "left"
    ? `linear-gradient(90deg, ${stops})`
    : `linear-gradient(270deg, ${stops})`
}

/**
 * The phone as an object on the stage. `pose` is the body language (waddle,
 * lean, turn to present) and `pop` is the one celebration squash. Both are
 * transforms, so they compose instead of fighting.
 */
export const PhoneView: React.FC<{
  layout: PhoneLayout
  clip: PhoneClip | null
  sec: number
  ripples: RippleSpec[]
  pose: Pose
  pop: CelebrationStyle
  opacity: number
  light: LightNow
  litFrom: LitSide
}> = ({ layout, clip, sec, ripples, pose, pop, opacity, light, litFrom }) => {
  const transform = [
    `translate3d(${pose.x + pop.x}px, ${pose.y + pop.y}px, 0)`,
    `rotateX(${pose.rotateX}deg)`,
    `rotateY(${pose.rotateY}deg)`,
    `rotateZ(${pose.rotateZ + pop.rotate}deg)`,
    `scale(${pose.scale * pop.scaleX}, ${pose.scale * pop.scaleY})`,
  ].join(" ")
  const lit = phoneLit(light, litFrom)
  const falloffWidth = Math.round(layout.frameWidth * lit.spread)
  return (
    <div
      style={{
        position: "absolute",
        left: layout.left - layout.bezel,
        top: layout.top - layout.bezel,
        width: layout.frameWidth,
        height: layout.frameHeight,
        perspective: 1800,
        opacity,
        transformOrigin: "50% 62%",
        transform,
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
          boxShadow: `0 0 0 1px ${line}, 0 1px 0 rgba(255,255,255,0.06) inset, 0 40px 90px rgba(0,0,0,0.65)`,
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
          <Screen layout={layout} clip={clip} sec={sec} ripples={ripples} />
        </div>
        {/* The lit face: light spreads from the pool side across the body and
            falls away toward the shadow. Drawn over the screen like glare. */}
        <div
          style={{
            position: "absolute",
            top: 2,
            bottom: 2,
            ...(lit.litFrom === "left" ? { left: 0 } : { right: 0 }),
            width: falloffWidth,
            background: falloffGradient(lit.falloffAlpha, lit.litFrom),
            filter: `blur(${Math.round(lit.blur)}px)`,
            mixBlendMode: "screen",
            pointerEvents: "none",
            borderRadius: Math.round(24 + layout.bezel * 0.5),
          }}
        />
        {/* The edge itself: a thin bright rim, tapered top and bottom, always
            softened so it reads as light on metal, never a drawn outline. */}
        <div
          style={{
            position: "absolute",
            top: layout.bezel * 0.7,
            bottom: layout.bezel * 0.7,
            ...(lit.litFrom === "left" ? { left: 0.5 } : { right: 0.5 }),
            width: 2.4,
            background: edgeGradient(lit.edgeAlpha),
            filter: `blur(${Math.max(0.6, lit.blur * 0.12)}px)`,
            mixBlendMode: "screen",
            pointerEvents: "none",
          }}
        />
      </div>
    </div>
  )
}

export const rippleProgress = (sec: number, at: number): number =>
  Math.min(1, Math.max(0, (sec - at) / rippleDuration))
