import { AbsoluteFill, useVideoConfig } from "remotion"
import type { PhoneLayout } from "./camera"
import { parallax, poolLit, type LightNow, type LightShape } from "./stage"

// The stage, back to front: wall and floor, then the pool, then the phone, then
// the haze. This file draws the three layers that are not the phone, plus the
// shadow that puts the phone on the floor and the mask that makes the intro and
// outro slides catch only the edge of the pool.
//
// A gradient on its own is not a stage. Every plane here carries one feature
// that can be seen to move at its own speed, so the drift reads as parallax
// instead of a still image breathing:
//
//   wall   vertical striations, slowest
//   floor  scuffs, on the phone's plane
//   pool   a lit patch with a rim, sliding across the floor
//   haze   a shaft and dust, fastest, crossing in front of the phone

const POOL_RGB = "226, 236, 255"
const WALL_RGB = "140, 162, 196"
const HAZE_RGB = "206, 222, 252"
const LIME_RGB = "182, 243, 107"

/** Where the floor meets the wall, as a fraction of stage height. */
const SEAM = 0.585

// Deterministic dust and floor grain. Nothing here may call Math.random: a mote
// must land on the same pixel every time the frame is rendered.
const mulberry32 = (seed: number) => {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const wrap = (value: number, span: number): number => {
  const wrapped = value % span
  return wrapped < 0 ? wrapped + span : wrapped
}

const MOTES = Array.from({ length: 64 }, (_, index) => {
  const rand = mulberry32(Math.imul(index + 7, 0x9e3779b1))
  return {
    x: rand(),
    y: rand(),
    size: 1.2 + rand() * 3.4,
    speed: 0.004 + rand() * 0.014,
    phase: rand() * Math.PI * 2,
    bob: 0.004 + rand() * 0.012,
  }
})

/** Short marks on the floor. They are the reference the pool slides across. */
const SCUFFS = Array.from({ length: 9 }, (_, index) => {
  const rand = mulberry32(Math.imul(index + 3, 0x85ebca6b))
  return {
    x: rand(),
    y: 0.14 + rand() * 0.74,
    width: 70 + rand() * 190,
    opacity: 0.03 + rand() * 0.06,
  }
})

/**
 * Lumps of light on the pool rim. Real light on a rough floor does not end on a
 * clean ellipse, so the rim is broken up by seeded blobs of varying size.
 */
const RIM_RAGS = Array.from({ length: 20 }, (_, index) => {
  const rand = mulberry32(Math.imul(index + 17, 0x27d4eb2f))
  return {
    angle: rand() * Math.PI * 2,
    offset: -0.05 + rand() * 0.1,
    width: 0.45 + rand() * 1.5,
    height: 0.3 + rand() * 1.1,
    alpha: 0.2 + rand() * 0.8,
  }
})

/**
 * Wall and floor. Always the darkest layer, but never featureless: the seam,
 * the wall striations and the floor scuffs are what tell the eye there are two
 * planes here and that they are moving at different rates.
 */
export const StageBack: React.FC<{ light: LightNow; drift: number }> = ({ light, drift }) => {
  const { width, height } = useVideoConfig()
  const shape = light.shape
  const lit = Math.min(1, shape.intensity * 1.7)
  const seamY = height * SEAM
  const back = parallax("back", drift)
  // The floor is the plane the phone stands on, so it shares the phone's speed.
  const floor = parallax("phone", drift)
  return (
    <AbsoluteFill style={{ background: "#020308", overflow: "hidden" }}>
      {/* The wall. */}
      <div
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          top: 0,
          height: seamY,
          background: "linear-gradient(180deg, #05070C 0%, #080B12 40%, #0A0E16 100%)",
        }}
      />
      {/* Wall striations: the slowest plane, and the one that shows the wall is a wall. */}
      <div
        style={{
          position: "absolute",
          left: -220 + back,
          top: 0,
          width: width + 440,
          height: seamY,
          background: `repeating-linear-gradient(90deg, rgba(${WALL_RGB},0.14) 0px, rgba(${WALL_RGB},0.14) 1.5px, transparent 1.5px, transparent 104px)`,
          maskImage: "linear-gradient(180deg, rgba(0,0,0,0.85), rgba(0,0,0,0.25) 78%, transparent 100%)",
          opacity: 0.5 + lit * 0.5,
        }}
      />
      {/* The floodlight's bounce on the wall: wide, dim, sitting on the seam. */}
      <div
        style={{
          position: "absolute",
          left: shape.centreX * width - width * 0.5 + back,
          top: seamY - height * 0.66,
          width: width,
          height: height * 0.74,
          background: `radial-gradient(ellipse 50% 50% at 50% 100%, rgba(${WALL_RGB},${0.15 * lit}) 0%, rgba(${WALL_RGB},${0.07 * lit}) 46%, transparent 78%)`,
          filter: "blur(30px)",
          mixBlendMode: "screen",
        }}
      />

      {/* The floor, from the horizon down. Brightest right at the seam. */}
      <div
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          top: seamY,
          bottom: 0,
          background:
            "linear-gradient(180deg, #0D1117 0%, #090C12 36%, #05070B 72%, #020305 100%)",
        }}
      />
      {SCUFFS.map((scuff, index) => (
        <div
          key={`scuff-${index}`}
          style={{
            position: "absolute",
            left: wrap(scuff.x * (width + 400) + floor, width + 400) - 200,
            top: seamY + scuff.y * (height - seamY),
            width: scuff.width,
            height: 1.5,
            background: `rgba(${WALL_RGB},${scuff.opacity * (0.6 + lit * 0.8)})`,
            filter: "blur(0.5px)",
          }}
        />
      ))}
      {/* The light landing on the floor at the base of the wall. */}
      <div
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          top: seamY,
          height: height * 0.14,
          background: `linear-gradient(180deg, rgba(${POOL_RGB},${0.05 * lit}) 0%, rgba(${POOL_RGB},${0.02 * lit}) 44%, transparent 100%)`,
          mixBlendMode: "screen",
        }}
      />
      {/* The seam itself, lit only where the pool reaches it. */}
      <div
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          top: seamY,
          height: 1,
          background: `rgba(${WALL_RGB},${0.06 + 0.18 * lit})`,
          maskImage: `linear-gradient(90deg, transparent 2%, rgba(0,0,0,0.55) 22%, #000 ${Math.round(shape.centreX * 100)}%, rgba(0,0,0,0.55) 78%, transparent 98%)`,
        }}
      />
      <div
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          top: seamY - 5,
          height: 11,
          background: `rgba(${WALL_RGB},${0.07 * lit})`,
          filter: "blur(6px)",
          maskImage: `linear-gradient(90deg, transparent 4%, rgba(0,0,0,0.5) 26%, #000 ${Math.round(shape.centreX * 100)}%, rgba(0,0,0,0.5) 74%, transparent 96%)`,
        }}
      />

      {/* The near floor falls away into the dark, and the room closes in. */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          background: "linear-gradient(180deg, transparent 58%, rgba(0,0,0,0.5) 100%)",
        }}
      />
      <div
        style={{
          position: "absolute",
          inset: 0,
          background:
            "radial-gradient(135% 100% at 50% 44%, transparent 44%, rgba(0,0,0,0.3) 82%, rgba(0,0,0,0.58) 100%)",
        }}
      />
    </AbsoluteFill>
  )
}

/**
 * The lit ellipse where the floor meets the wall. Three pieces: the body of the
 * light, a rim so it reads as a patch with an edge instead of a soft gradient,
 * and the sheen spilling toward the camera. Plus the bloom, which is the light
 * reaching past the pool and only happens on `reward`.
 */
export const PoolGlow: React.FC<{ light: LightNow; drift: number }> = ({ light, drift }) => {
  const { width, height } = useVideoConfig()
  const shape = light.shape
  const rx = shape.radiusX * width
  const ry = shape.radiusY * height
  const intensity = shape.intensity
  const centreX = shape.centreX * width + parallax("pool", drift)
  const centreY = shape.centreY * height
  const rimBlur = Math.round(6 + shape.flare * 8)
  return (
    <AbsoluteFill style={{ pointerEvents: "none", overflow: "hidden" }}>
      <div
        style={{
          position: "absolute",
          left: centreX - rx,
          top: centreY - ry,
          width: rx * 2,
          height: ry * 2,
          borderRadius: "50%",
          background: `radial-gradient(ellipse at 50% 54%, rgba(${POOL_RGB},${0.66 * intensity}) 0%, rgba(${POOL_RGB},${0.54 * intensity}) 30%, rgba(${POOL_RGB},${0.26 * intensity}) 58%, rgba(${POOL_RGB},${0.08 * intensity}) 82%, rgba(${POOL_RGB},0) 100%)`,
          filter: `blur(${Math.round(10 + shape.flare * 16)}px)`,
          mixBlendMode: "screen",
          // The pool is on the floor. Anything above the seam is the wall's
          // bounce, not the pool, so the body stops at the seam.
          maskImage: "linear-gradient(180deg, transparent 0%, rgba(0,0,0,0.3) 13%, #000 27%)",
        }}
      />
      {/* The edge. A pool of light on a floor has a boundary; a gradient does not. */}
      <div
        style={{
          position: "absolute",
          left: centreX - rx * 0.93,
          top: centreY - ry * 0.93,
          width: rx * 1.86,
          height: ry * 1.86,
          borderRadius: "50%",
          border: `3px solid rgba(${POOL_RGB},${0.07 + 0.26 * intensity})`,
          boxShadow: `0 0 ${Math.round(22 + 26 * shape.flare)}px rgba(${POOL_RGB},${0.06 + 0.16 * intensity})`,
          filter: `blur(${rimBlur}px)`,
          mixBlendMode: "screen",
          maskImage: "linear-gradient(180deg, transparent 0%, rgba(0,0,0,0.35) 14%, #000 30%)",
        }}
      />
      {/* Falloff noise. Seeded lumps of light sit on the rim and vary its
          brightness, so the edge reads as light on a rough floor, not a decal. */}
      {RIM_RAGS.map((rag, index) => {
        const x = centreX + Math.cos(rag.angle) * rx * (0.93 + rag.offset)
        const y = centreY + Math.sin(rag.angle) * ry * (0.93 + rag.offset)
        const w = Math.max(24, rx * 0.22 * rag.width)
        const h = Math.max(14, ry * 0.5 * rag.height)
        const alpha = (0.05 + 0.26 * intensity) * rag.alpha
        return (
          <div
            key={`rim-rag-${index}`}
            style={{
              position: "absolute",
              left: x - w / 2,
              top: y - h / 2,
              width: w,
              height: h,
              borderRadius: "50%",
              background: `radial-gradient(ellipse at 50% 50%, rgba(${POOL_RGB},${alpha}) 0%, rgba(${POOL_RGB},${alpha * 0.42}) 46%, rgba(${POOL_RGB},0) 74%)`,
              filter: `blur(${Math.round(7 + shape.flare * 8)}px)`,
              mixBlendMode: "screen",
              maskImage: "linear-gradient(180deg, transparent 0%, rgba(0,0,0,0.35) 14%, #000 30%)",
            }}
          />
        )
      })}
      {/* The sheen running from the pool towards the camera. */}
      <div
        style={{
          position: "absolute",
          left: centreX - rx * 0.44,
          top: centreY,
          width: rx * 0.88,
          height: ry * 1.9,
          background: `radial-gradient(ellipse 50% 50% at 50% 0%, rgba(${POOL_RGB},${0.16 * intensity}) 0%, rgba(${POOL_RGB},${0.05 * intensity}) 52%, transparent 78%)`,
          filter: "blur(28px)",
          mixBlendMode: "screen",
        }}
      />
      {shape.flare > 0.02 ? (
        <div
          style={{
            position: "absolute",
            left: centreX - rx * 1.55,
            top: centreY - ry * 1.5,
            width: rx * 3.1,
            height: ry * 3,
            borderRadius: "50%",
            background: `radial-gradient(ellipse at 50% 50%, rgba(${LIME_RGB},${0.14 * shape.flare}) 0%, rgba(${POOL_RGB},${0.09 * shape.flare}) 46%, transparent 74%)`,
            filter: "blur(38px)",
            mixBlendMode: "screen",
          }}
        />
      ) : null}
    </AbsoluteFill>
  )
}

/**
 * The phone's shadow on the floor. Without this the phone is a rectangle pasted
 * over a gradient; with it the object stands on the plane the pool is lighting.
 * Drawn after the pool and before the phone, so the pool darkens where the phone
 * blocks it.
 */
export const ContactShadow: React.FC<{
  layout: PhoneLayout
  light: LightNow
  opacity: number
}> = ({ layout, light, opacity }) => {
  if (opacity <= 0.01) {
    return null
  }
  const visible = Math.min(1, 0.45 + light.shape.intensity * 0.8) * opacity
  const feetX = layout.left + layout.width / 2
  const feetY = layout.top + layout.height + layout.bezel * 0.5
  const spreadW = layout.width * 1.2
  const spreadH = layout.width * 0.3
  return (
    <AbsoluteFill style={{ pointerEvents: "none", overflow: "hidden" }}>
      <div
        style={{
          position: "absolute",
          left: feetX - spreadW / 2,
          top: feetY - spreadH / 2,
          width: spreadW,
          height: spreadH,
          borderRadius: "50%",
          background: `radial-gradient(ellipse at 50% 50%, rgba(0,0,0,${0.62 * visible}) 0%, rgba(0,0,0,${0.42 * visible}) 40%, rgba(0,0,0,0) 76%)`,
          filter: "blur(20px)",
        }}
      />
      {/* Contact darkening, tight under the feet. */}
      <div
        style={{
          position: "absolute",
          left: feetX - layout.width * 0.34,
          top: feetY - layout.width * 0.05,
          width: layout.width * 0.68,
          height: layout.width * 0.1,
          borderRadius: "50%",
          background: `radial-gradient(ellipse at 50% 50%, rgba(0,0,0,${0.8 * visible}) 0%, rgba(0,0,0,0.3 * visible) 58%, rgba(0,0,0,0) 100%)`,
          filter: "blur(9px)",
        }}
      />
    </AbsoluteFill>
  )
}

/**
 * The foreground shaft and dust. The nearest layer, so it passes over the phone.
 * Dust never fully leaves: a room with a lamp in it always has something in the
 * air, even when the beam itself has narrowed to a slit.
 */
export const StageHaze: React.FC<{ light: LightNow; drift: number; sec: number }> = ({
  light,
  drift,
  sec,
}) => {
  const { width, height } = useVideoConfig()
  const shape = light.shape
  const offset = parallax("haze", drift)
  const dust = Math.max(shape.haze, 0.055)
  return (
    <AbsoluteFill style={{ pointerEvents: "none", overflow: "hidden" }}>
      {shape.haze > 0.02 ? (
        <>
          <div
            style={{
              position: "absolute",
              left: -width * 0.35 + offset,
              top: -height * 0.35,
              width: width * 1.7,
              height: height * 1.7,
              background: `linear-gradient(102deg, transparent 28%, rgba(${HAZE_RGB},${0.12 * shape.haze}) 42%, rgba(${HAZE_RGB},${0.2 * shape.haze}) 52%, rgba(${HAZE_RGB},${0.07 * shape.haze}) 63%, transparent 74%)`,
              filter: "blur(48px)",
              mixBlendMode: "screen",
            }}
          />
          {/* A tighter second pass, so the beam has a visible core edge. */}
          <div
            style={{
              position: "absolute",
              left: -width * 0.3 + offset * 1.15,
              top: -height * 0.25,
              width: width * 1.25,
              height: height * 1.5,
              background: `linear-gradient(99deg, transparent 34%, rgba(${HAZE_RGB},${0.09 * shape.haze}) 48%, rgba(${HAZE_RGB},${0.04 * shape.haze}) 57%, transparent 65%)`,
              filter: "blur(18px)",
              mixBlendMode: "screen",
            }}
          />
        </>
      ) : null}
      {MOTES.map((mote, index) => {
        const x = wrap(mote.x + sec * mote.speed + offset / width, 1)
        const y = mote.y + Math.sin(sec * 0.4 + mote.phase) * mote.bob
        const lit = poolLit(shape, x, y)
        const opacity = dust * (0.14 + 0.95 * lit)
        if (opacity <= 0.01) {
          return null
        }
        return (
          <div
            key={index}
            style={{
              position: "absolute",
              left: x * width,
              top: y * height,
              width: mote.size,
              height: mote.size,
              borderRadius: "50%",
              background: `rgba(${HAZE_RGB},${opacity})`,
            }}
          />
        )
      })}
    </AbsoluteFill>
  )
}

/**
 * The darkness outside the pool. Multiplied over a slide, it leaves only the
 * part of the graphic the light actually reaches, which is how the intro and the
 * outro "sit in the dark and catch only the edge of the pool".
 *
 * The mask stops at 0.62, not 1: the slide is meant to be dim, never unreadable.
 */
export const LightMask: React.FC<{ shape: LightShape }> = ({ shape }) => {
  const { width, height } = useVideoConfig()
  // The pool is drawn low on the floor, but a slide is type, not a floor object:
  // the mask is held at the slide's own height so the words stay readable.
  const rx = Math.round(shape.radiusX * width * 1.9)
  const ry = Math.round(Math.max(shape.radiusY, 0.3) * height * 2.2)
  const centreY = Math.round(Math.min(shape.centreY, 0.6) * 100)
  return (
    <AbsoluteFill
      style={{
        pointerEvents: "none",
        background: `radial-gradient(ellipse ${rx}px ${ry}px at ${Math.round(shape.centreX * 100)}% ${centreY}%, rgba(0,0,0,0) 0%, rgba(0,0,0,0.1) 42%, rgba(0,0,0,0.38) 72%, rgba(0,0,0,0.62) 100%)`,
        mixBlendMode: "multiply",
      }}
    />
  )
}
