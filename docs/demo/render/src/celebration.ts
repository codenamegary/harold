import { interpolate } from "remotion"
import { type Celebration } from "./timeline"

const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const

export type CelebrationStyle = {
  x: number
  y: number
  scaleX: number
  scaleY: number
  rotate: number
}

const REST: CelebrationStyle = { x: 0, y: 0, scaleX: 1, scaleY: 1, rotate: 0 }

// [POP] a damped squash and shake. One beat, no CSS animation, so it renders
// the same frame by frame.
//
// The film allows exactly one of these, at the achievement hinge, and the same
// celebration carries the only confetti burst (see `confetti.tsx`). The close
// ends on a spotlight alone.
export const celebrationStyle = (celebrations: Celebration[], sec: number): CelebrationStyle => {
  const active = celebrations.find(
    (celebration) => sec >= celebration.at && sec <= celebration.at + celebration.hold,
  )
  if (active === undefined) {
    return REST
  }

  const t = (sec - active.at) / active.hold
  const strength = active.strength
  const mix = (value: number) => 1 + (value - 1) * strength
  const squashX = mix(
    interpolate(
      t,
      [0, 0.08, 0.18, 0.3, 0.46, 0.66, 0.84, 1],
      [1, 1.14, 0.92, 1.05, 0.98, 1.012, 0.998, 1],
      clamp,
    ),
  )
  const squashY = mix(
    interpolate(
      t,
      [0, 0.08, 0.18, 0.3, 0.46, 0.66, 0.84, 1],
      [1, 0.8, 1.12, 0.95, 1.03, 0.992, 1.004, 1],
      clamp,
    ),
  )
  const pop = mix(
    interpolate(t, [0, 0.1, 0.22, 0.38, 0.6, 1], [1, 0.97, 1.04, 0.99, 1.01, 1], clamp),
  )
  const damp = 1 - t

  return {
    x: Math.sin(t * Math.PI * 10) * 22 * damp * strength,
    y: Math.sin(t * Math.PI * 12 + 0.7) * 8 * damp * strength,
    scaleX: squashX * pop,
    scaleY: squashY * pop,
    rotate: Math.sin(t * Math.PI * 14) * 4.5 * damp * strength,
  }
}
