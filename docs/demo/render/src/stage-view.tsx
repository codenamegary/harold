import { AbsoluteFill, useCurrentFrame, useVideoConfig } from "remotion"
import type { PhoneLayout } from "./camera"
import {
  beamCone,
  beamHalfAt,
  FLARE_SPREAD,
  HORIZON,
  parallax,
  type BeamCone,
  type LightNow,
  type WorldView,
} from "./stage"

// The stage, back to front: a dark void, a floor that only shows where the
// light spills on it, the pool, the shaft that lands in the pool, the phone,
// then the dust in the shaft. One light. Everything it touches has a soft
// edge, because the air has haze in it. Nothing else is lit.
//
// The floor, the pool, the shaft and the dust are drawn in world space, inside
// `StageWorld`. The void, the contact shadow and the grade are on the screen.

const POOL = "236, 242, 255"
const LIME = "182, 243, 107"

/** How far the floor and the wall run past the frame, so a wide view never finds an edge. */
const SPAN = 5

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

const unit = (value: number): number => Math.min(1, Math.max(0, value))

// Dust, only ever drawn inside the shaft. A few big soft motes sit near the
// lens, the rest are specks. One set hangs behind the phone and one in front.
type Mote = {
  across: number
  down: number
  size: number
  blur: number
  glow: number
  speed: number
  sway: number
  phase: number
}

const motes = (count: number, seed: number): Mote[] =>
  Array.from({ length: count }, (_, index) => {
    const rand = mulberry32(Math.imul(index + seed, 0x9e3779b1))
    const near = rand() > 0.74
    return {
      across: rand() * 2 - 1,
      down: rand(),
      size: near ? 8 + rand() * 8 : 3 + rand() * 3.5,
      blur: near ? 2.5 + rand() * 2.5 : 0.6,
      glow: near ? 0.2 + rand() * 0.14 : 0.36 + rand() * 0.36,
      speed: 0.012 + rand() * 0.02,
      sway: 0.04 + rand() * 0.07,
      phase: rand() * Math.PI * 2,
    }
  })

const MOTES_BEHIND = motes(20, 7)
const MOTES_FRONT = motes(10, 131)

/** How bright the shaft is in the haze. A dim state is a dim shaft, not no shaft. */
const shaftAlpha = (light: LightNow): number => 0.035 + light.shape.haze * 0.2

/**
 * The shaft's outline inside its own box: the lamp at the top, the pool's
 * near edge at the bottom. `width` narrows it around the centre line.
 */
const shaftPath = (cone: BeamCone, width: number): { box: React.CSSProperties; clip: string } => {
  const halfX = cone.footHalfX * width
  const halfY = cone.footHalfY * width
  const apexHalf = cone.apexHalf * width
  const left = cone.footX - halfX
  const top = cone.apexY
  const floor = cone.footY - top
  const arc = Array.from({ length: 25 }, (_, index) => {
    const angle = (index / 24) * Math.PI
    return `${halfX + Math.cos(angle) * halfX}px ${floor + Math.sin(angle) * halfY}px`
  })
  const points = [`${halfX - apexHalf}px 0px`, `${halfX + apexHalf}px 0px`, ...arc]
  return {
    box: { position: "absolute", left, top, width: halfX * 2, height: floor + halfY },
    clip: `polygon(${points.join(", ")})`,
  }
}

/**
 * One body of light. Brightest down the centre line, where the eye looks
 * through the most haze, and thinner toward the floor. The blur makes the
 * outline haze instead of a cut-out.
 */
const Shaft: React.FC<{ cone: BeamCone; width: number; alpha: number; blur: number }> = ({
  cone,
  width,
  alpha,
  blur,
}) => {
  const path = shaftPath(cone, width)
  return (
    <div style={{ position: "absolute", left: 0, top: 0, filter: `blur(${blur}px)` }}>
      <div
        style={{
          ...path.box,
          clipPath: path.clip,
          background: `linear-gradient(90deg, rgba(${POOL},${alpha * 0.42}) 0%, rgba(${POOL},${alpha * 0.8}) 24%, rgba(${POOL},${alpha}) 50%, rgba(${POOL},${alpha * 0.8}) 76%, rgba(${POOL},${alpha * 0.42}) 100%)`,
          maskImage:
            "linear-gradient(180deg, #000 0%, #000 56%, rgba(0,0,0,0.66) 80%, rgba(0,0,0,0.34) 100%)",
        }}
      />
    </div>
  )
}

/** Dust in the shaft. It falls slowly, sways, and fades at the shaft's edge. */
const Dust: React.FC<{ cone: BeamCone; set: Mote[]; sec: number; gain: number; sway: number }> = ({
  cone,
  set,
  sec,
  gain,
  sway,
}) => {
  const top = cone.footY - cone.footHalfX * 2.6
  const fall = cone.footY - top
  return (
    <>
      {set.map((mote, index) => {
        const down = wrap(mote.down + sec * mote.speed, 1)
        const across = mote.across * 0.8 + Math.sin(sec * 0.6 + mote.phase) * mote.sway
        const y = top + down * fall
        const x = cone.footX + across * beamHalfAt(cone, y) + sway
        const edge = unit((1 - Math.abs(across)) * 2.4)
        const ends = Math.min(1, down / 0.12, (1 - down) / 0.12)
        const opacity = gain * mote.glow * edge * ends
        if (opacity <= 0.02) {
          return null
        }
        return (
          <div
            key={index}
            style={{
              position: "absolute",
              left: x - mote.size / 2,
              top: y - mote.size / 2,
              width: mote.size,
              height: mote.size,
              borderRadius: "50%",
              background: `rgba(255,255,255,${opacity})`,
              filter: `blur(${mote.blur}px)`,
            }}
          />
        )
      })}
    </>
  )
}

/** The void. The darkest layer, and the only one that never moves. */
export const StageBack: React.FC = () => (
  <AbsoluteFill
    style={{
      background:
        "radial-gradient(ellipse 85% 75% at 50% 42%, #0A0D12 0%, #060709 58%, #020203 100%)",
    }}
  />
)

/**
 * Places the world on the screen. Children are drawn in world px and are free
 * to run past the frame.
 */
export const StageWorld: React.FC<{ view: WorldView; children: React.ReactNode }> = ({
  view,
  children,
}) => {
  const { width, height } = useVideoConfig()
  return (
    <AbsoluteFill style={{ pointerEvents: "none", overflow: "hidden" }}>
      <div
        style={{
          position: "absolute",
          left: 0,
          top: 0,
          width,
          height,
          transformOrigin: "0px 0px",
          translate: `${view.x}px ${view.y}px`,
          scale: `${view.scale}`,
        }}
      >
        {children}
      </div>
    </AbsoluteFill>
  )
}

/**
 * The floor and the wall. Neither has a colour of its own. The floor shows
 * where the pool spills onto it and the wall shows a little bounce, so the
 * horizon is only there near the light.
 */
export const StageFloor: React.FC<{ light: LightNow; drift: number }> = ({ light, drift }) => {
  const { width, height } = useVideoConfig()
  const shape = light.shape
  const horizon = height * HORIZON
  const back = parallax("back", drift)
  const centreX = shape.centreX * width + parallax("pool", drift)
  const centreY = shape.centreY * height
  const spillX = shape.radiusX * width * 2.2
  const spillY = shape.radiusY * height * 4.2
  const bounceX = shape.radiusX * width * 1.9
  const bounceY = height * 0.4
  const spill = shape.intensity * 0.17
  const bounce = shape.intensity * 0.05 + shape.haze * 0.02
  const seam = 0.035 + shape.intensity * 0.05
  const reach = width * SPAN
  return (
    <>
      <div
        style={{
          position: "absolute",
          left: -reach,
          width: reach * 2 + width,
          top: horizon - height * SPAN,
          height: height * SPAN,
          overflow: "hidden",
        }}
      >
        <div
          style={{
            position: "absolute",
            left: reach + centreX - bounceX,
            top: height * SPAN - bounceY,
            width: bounceX * 2,
            height: bounceY * 2,
            borderRadius: "50%",
            background: `radial-gradient(closest-side, rgba(${POOL},${bounce}) 0%, rgba(${POOL},${bounce * 0.45}) 45%, rgba(${POOL},0) 100%)`,
          }}
        />
      </div>
      <div
        style={{
          position: "absolute",
          left: -reach,
          width: reach * 2 + width,
          top: horizon,
          height: height * SPAN,
          overflow: "hidden",
        }}
      >
        <div
          style={{
            position: "absolute",
            inset: 0,
            translate: `${back}px 0px`,
            background: `linear-gradient(180deg, rgba(${POOL},0.014) 0px, rgba(${POOL},0) ${height * 0.4}px)`,
          }}
        />
        <div
          style={{
            position: "absolute",
            left: reach + centreX - spillX,
            top: centreY - horizon - spillY,
            width: spillX * 2,
            height: spillY * 2,
            borderRadius: "50%",
            background: `radial-gradient(closest-side, rgba(${POOL},${spill}) 0%, rgba(${POOL},${spill * 0.6}) 36%, rgba(${POOL},${spill * 0.2}) 68%, rgba(${POOL},0) 100%)`,
          }}
        />
        <div
          style={{
            position: "absolute",
            left: reach + centreX - spillX * 1.25,
            width: spillX * 2.5,
            top: 0,
            height: 2,
            background: `linear-gradient(90deg, rgba(${POOL},0) 0%, rgba(${POOL},${seam}) 32%, rgba(${POOL},${seam}) 68%, rgba(${POOL},0) 100%)`,
          }}
        />
      </div>
    </>
  )
}

/**
 * The lit ellipse on the floor, and the flare when the state has one. Even
 * across the middle, with a soft rim, the way a real pool falls off.
 */
export const PoolGlow: React.FC<{ light: LightNow; drift: number }> = ({ light, drift }) => {
  const { width, height } = useVideoConfig()
  const shape = light.shape
  const rx = shape.radiusX * width
  const ry = shape.radiusY * height
  const centreX = shape.centreX * width + parallax("pool", drift)
  const centreY = shape.centreY * height
  const hot = shape.intensity * 0.6
  const flareRx = rx * FLARE_SPREAD
  const flareRy = ry * 1.35
  return (
    <>
      <div
        style={{
          position: "absolute",
          left: centreX - rx,
          top: centreY - ry,
          width: rx * 2,
          height: ry * 2,
          borderRadius: "50%",
          background: `radial-gradient(closest-side, rgba(${POOL},${hot}) 0%, rgba(${POOL},${hot * 0.94}) 48%, rgba(${POOL},${hot * 0.66}) 72%, rgba(${POOL},${hot * 0.24}) 89%, rgba(${POOL},0) 100%)`,
        }}
      />
      <div
        style={{
          position: "absolute",
          left: centreX - rx * 0.6,
          top: centreY - ry * 0.6,
          width: rx * 1.2,
          height: ry * 1.2,
          borderRadius: "50%",
          background: `radial-gradient(closest-side, rgba(255,255,255,${hot * 0.3}) 0%, rgba(255,255,255,0) 100%)`,
        }}
      />
      {shape.flare > 0.02 ? (
        <div
          style={{
            position: "absolute",
            left: centreX - flareRx,
            top: centreY - flareRy * 0.55,
            width: flareRx * 2,
            height: flareRy * 2,
            borderRadius: "50%",
            filter: "blur(6px)",
            background: `radial-gradient(ellipse at 50% 58%, rgba(${LIME},0) 54%, rgba(${LIME},${0.8 * shape.flare}) 68%, rgba(${LIME},${0.8 * shape.flare}) 76%, rgba(${LIME},0) 90%)`,
          }}
        />
      ) : null}
    </>
  )
}

/**
 * The shaft. Drawn behind the phone so the phone stands in it. The foot is
 * the pool ellipse: same centre, same radii, same drift. A wide soft body and
 * a brighter core, both blurred, so the edge is haze and not a cut-out.
 */
export const StageBeam: React.FC<{ light: LightNow; drift: number; sec: number }> = ({
  light,
  drift,
  sec,
}) => {
  const { width, height } = useVideoConfig()
  const cone = beamCone(light.shape, width, height, drift)
  const alpha = shaftAlpha(light)
  return (
    <>
      <Shaft cone={cone} width={1} alpha={alpha} blur={44} />
      <Dust cone={cone} set={MOTES_BEHIND} sec={sec} gain={light.shape.haze} sway={0} />
    </>
  )
}

/**
 * The phone's shadow on the lit floor. A tight dark contact under the feet
 * and a wider soft one that leans away from the lamp. It tracks the phone
 * across the stage, shrinks when the phone hops, and only reads where the
 * pool is.
 */
export const ContactShadow: React.FC<{
  layout: PhoneLayout
  /** Where the feet are, relative to the layout's own rest position. */
  x: number
  y: number
  lift: number
  scale: number
  /** How lit the floor under the feet is, 0..1. */
  lit: number
  /** Which way the shadow leans, -1..1. Away from the lamp. */
  lean: number
  opacity: number
}> = ({ layout, x, y, lift, scale, lit, lean, opacity }) => {
  const landed = Math.max(0.3, 1 - lift / 70)
  const visible = opacity * unit(lit * 1.5)
  if (visible <= 0.02) {
    return null
  }
  const feetX = layout.left + layout.width / 2 + x
  const feetY = layout.top + layout.height + layout.bezel + y
  const contactW = layout.frameWidth * 0.94 * scale * (0.82 + landed * 0.18)
  const contactH = Math.max(10, contactW * 0.1)
  const castW = contactW * 1.7
  const castH = contactW * 0.3
  return (
    <AbsoluteFill style={{ pointerEvents: "none", overflow: "hidden" }}>
      <div
        style={{
          position: "absolute",
          left: feetX - castW / 2 + lean * contactW * 0.22,
          top: feetY - castH * 0.42,
          width: castW,
          height: castH,
          borderRadius: "50%",
          background: `radial-gradient(closest-side, rgba(0,0,0,${0.5 * visible * landed}) 0%, rgba(0,0,0,${0.26 * visible * landed}) 50%, rgba(0,0,0,0) 100%)`,
        }}
      />
      <div
        style={{
          position: "absolute",
          left: feetX - contactW / 2,
          top: feetY - contactH * 0.6,
          width: contactW,
          height: contactH,
          borderRadius: "50%",
          background: `radial-gradient(closest-side, rgba(0,0,0,${0.92 * visible * landed}) 0%, rgba(0,0,0,${0.6 * visible * landed}) 55%, rgba(0,0,0,0) 100%)`,
        }}
      />
    </AbsoluteFill>
  )
}

/**
 * The nearest layer: the part of the shaft between the phone and the lens,
 * and the dust in it. It only shows on a wide view. A close-up keeps the
 * screen clean, because a speck over the app reads as a dead pixel. `depth`
 * is the view's scale.
 */
export const StageHaze: React.FC<{ light: LightNow; drift: number; sec: number; depth: number }> = ({
  light,
  drift,
  sec,
  depth,
}) => {
  const { width, height } = useVideoConfig()
  const cone = beamCone(light.shape, width, height, drift)
  const wide = unit((0.95 - depth) / 0.4)
  if (wide <= 0.01) {
    return null
  }
  return (
    <>
      <Shaft cone={cone} width={0.9} alpha={shaftAlpha(light) * 0.26 * wide} blur={40} />
      <Dust
        cone={cone}
        set={MOTES_FRONT}
        sec={sec}
        gain={light.shape.haze * wide}
        sway={parallax("haze", drift) - parallax("pool", drift)}
      />
    </>
  )
}

/**
 * Fine grain over the stage. The stage is all slow dark gradients, and eight
 * bits band on those. A little noise breaks the bands up before the encoder
 * sees them. It is under the phone, so the app stays clean.
 */
const Grain: React.FC = () => {
  const frame = useCurrentFrame()
  const { width, height } = useVideoConfig()
  return (
    <svg width={width} height={height} style={{ position: "absolute", left: 0, top: 0 }}>
      <filter
        id="stage-grain"
        x="0"
        y="0"
        width="100%"
        height="100%"
        colorInterpolationFilters="sRGB"
      >
        <feTurbulence
          type="fractalNoise"
          baseFrequency="0.85"
          numOctaves="1"
          seed={frame % 240}
          result="noise"
        />
        <feColorMatrix
          in="noise"
          values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0.07 0 0 0 -0.02"
          result="light"
        />
        <feColorMatrix
          in="noise"
          values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0.07 0 0 -0.02"
          result="dark"
        />
        <feMerge>
          <feMergeNode in="light" />
          <feMergeNode in="dark" />
        </feMerge>
      </filter>
      <rect width={width} height={height} filter="url(#stage-grain)" />
    </svg>
  )
}

/** The grade. A soft vignette that keeps the corners out of the picture, then the grain. */
export const StageGrade: React.FC = () => (
  <AbsoluteFill style={{ pointerEvents: "none" }}>
    <AbsoluteFill
      style={{
        background:
          "radial-gradient(ellipse 78% 78% at 50% 50%, rgba(0,0,0,0) 58%, rgba(0,0,0,0.42) 100%)",
      }}
    />
    <Grain />
  </AbsoluteFill>
)
