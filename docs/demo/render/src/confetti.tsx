import { interpolate, useVideoConfig } from "remotion"
import { type Celebration } from "./timeline"

const CONFETTI_SEC = 3.2
const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const

const COLORS = ["#B6F36B", "#F2F5F8", "#8F7CFF", "#56B8FF", "#FF8A5B", "#FFD166", "#FF6FA8"]

type Shape = "rect" | "circle" | "streamer"

type Particle = {
  startX: number
  startY: number
  size: number
  shape: Shape
  color: string
  delay: number
  fall: number
  gravity: number
  drift: number
  sway: number
  frequency: number
  phase: number
  spin: number
  rotation: number
  opacity: number
}

const hash = (value: number) => {
  const result = Math.sin(value * 12.9898 + 78.233) * 43758.5453
  return result - Math.floor(result)
}

const makeParticle = (index: number): Particle => {
  const random = (salt: number) => hash(index * 19.19 + salt * 73.31)
  const size = 7 + random(1) * 11
  const shapeRoll = random(2)
  const shape: Shape = shapeRoll > 0.74 ? "circle" : shapeRoll > 0.38 ? "streamer" : "rect"

  return {
    startX: random(3),
    startY: -0.18 + random(4) * 0.5,
    size,
    shape,
    color: COLORS[Math.floor(random(5) * COLORS.length)],
    delay: random(6) * 0.35,
    fall: 140 + random(7) * 220,
    gravity: 220 + random(8) * 160,
    drift: (random(9) - 0.5) * 220,
    sway: 8 + random(10) * 26,
    frequency: 4 + random(11) * 6,
    phase: random(12) * Math.PI * 2,
    spin: (random(13) - 0.5) * 720,
    rotation: random(14) * 360,
    opacity: 0.7 + random(15) * 0.3,
  }
}

const PARTICLES = Array.from({ length: 96 }, (_, index) => makeParticle(index))

const particleSize = (particle: Particle) => {
  if (particle.shape === "streamer") {
    return { width: particle.size * 0.42, height: particle.size * 2.1, radius: 2 }
  }
  if (particle.shape === "circle") {
    return { width: particle.size, height: particle.size, radius: 999 }
  }
  return { width: particle.size, height: particle.size * 0.55, radius: 2 }
}

// [CONFETTI] a full-stage paper shower. It starts on a celebration beat and
// runs on wall-clock seconds, independent of the phone pop length.
export const Confetti: React.FC<{ celebrations: Celebration[]; sec: number }> = ({
  celebrations,
  sec,
}) => {
  const { width, height } = useVideoConfig()
  const active = celebrations.filter(
    (celebration) =>
      celebration.confetti &&
      sec >= celebration.at &&
      sec <= celebration.at + CONFETTI_SEC + 0.4,
  )
  if (active.length === 0) {
    return null
  }

  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        overflow: "hidden",
        pointerEvents: "none",
      }}
    >
      {active.map((celebration) =>
        PARTICLES.map((particle, index) => {
          const since = sec - celebration.at - particle.delay
          if (since < 0 || since > CONFETTI_SEC) {
            return null
          }
          const size = particleSize(particle)
          const x =
            particle.startX * width +
            particle.drift * since +
            Math.sin(since * particle.frequency + particle.phase) * particle.sway
          const y =
            particle.startY * height + particle.fall * since + 0.5 * particle.gravity * since * since
          const rotation = particle.rotation + particle.spin * since
          const opacity = interpolate(
            since,
            [0, 0.12, CONFETTI_SEC - 0.8, CONFETTI_SEC],
            [0, particle.opacity, particle.opacity, 0],
            clamp,
          )

          return (
            <div
              key={`${celebration.at}-${index}`}
              style={{
                position: "absolute",
                left: 0,
                top: 0,
                width: size.width,
                height: size.height,
                borderRadius: size.radius,
                background: particle.color,
                opacity,
                translate: `${x}px ${y}px`,
                rotate: `${rotation}deg`,
              }}
            />
          )
        }),
      )}
    </div>
  )
}
