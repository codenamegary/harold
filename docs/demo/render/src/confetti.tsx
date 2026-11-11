import { AbsoluteFill, useVideoConfig } from "remotion"
import { dim, lime, mute, paper } from "./theme"
import { poolLit, type LightShape } from "./stage"
import { type Confetti } from "./timeline"

const COLORS = [lime, paper, mute, dim]

// A tiny seeded generator. Particles must be identical on every render of the
// same frame, so nothing here may call Math.random.
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

type Particle = {
  left: number
  top: number
  size: number
  rotate: number
  scaleY: number
  color: string
  opacity: number
  square: boolean
}

const particleAt = (
  index: number,
  burst: Confetti,
  sec: number,
  stageW: number,
  stageH: number,
): Particle | null => {
  const rand = mulberry32(Math.imul(index + 1, 0x9e3779b1) ^ 0x5f356495)
  const delay = rand() * 0.5
  const life = Math.max(0.4, burst.hold - delay)
  const t = (sec - burst.at - delay) / life
  if (t < 0 || t > 1) {
    return null
  }

  const spin = (rand() - 0.5) * 1080
  const phase = rand() * Math.PI * 2
  const x0 = rand() * stageW
  const drift = (rand() - 0.5) * 360
  const fall = stageH + 200
  const size = 8 + rand() * 14
  const color = COLORS[Math.floor(rand() * COLORS.length)] ?? lime
  const square = rand() > 0.35
  // The shower has body on its first visible frame, not 0.4 s later.
  const drop = rand() * stageH * 0.3

  return {
    left: x0 + drift * t + Math.sin(t * Math.PI * 3 + phase) * 24,
    top: -90 + drop + fall * t,
    size,
    rotate: spin * t + phase * 12,
    scaleY: Math.abs(Math.cos(t * 9 + phase)) * 0.85 + 0.15,
    color,
    opacity: t > 0.85 ? Math.max(0, (1 - t) / 0.15) : 1,
    square,
  }
}

/**
 * [CF] the film's only confetti burst, on the achievement.
 *
 * The shower falls *in* the light: every particle is dimmed by how far outside
 * the pool it is, so the confetti catches the pool instead of dropping onto a
 * flat black field. Silent and deterministic.
 */
export const ConfettiLayer: React.FC<{ bursts: Confetti[]; sec: number; light: LightShape }> = ({
  bursts,
  sec,
  light,
}) => {
  const { width, height } = useVideoConfig()
  return (
    <AbsoluteFill style={{ pointerEvents: "none" }}>
      {bursts.map((burst) => {
        const particles: React.ReactNode[] = []
        for (let index = 0; index < burst.count; index += 1) {
          const particle = particleAt(index, burst, sec, width, height)
          if (particle === null || particle.opacity <= 0) {
            continue
          }
          const lit = poolLit(light, particle.left / width, particle.top / height)
          const opacity = particle.opacity * (0.06 + 0.94 * lit)
          if (opacity <= 0.01) {
            continue
          }
          particles.push(
            <div
              key={index}
              style={{
                position: "absolute",
                left: particle.left,
                top: particle.top,
                width: particle.size,
                height: particle.size * 1.5,
                background: particle.color,
                borderRadius: particle.square ? 2 : particle.size,
                opacity,
                transform: `rotate(${particle.rotate}deg) scaleY(${particle.scaleY})`,
              }}
            />,
          )
        }
        return <AbsoluteFill key={burst.at}>{particles}</AbsoluteFill>
      })}
    </AbsoluteFill>
  )
}
