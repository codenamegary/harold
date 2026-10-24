import { Easing, interpolate } from "remotion"
import { displayFamily, monoFamily } from "./fonts"
import { lime, paper } from "./theme"
import { type Spotlight } from "./timeline"

const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const
const ease = Easing.bezier(0.16, 1, 0.3, 1)

const FADE_SEC = 0.55

// [SPOTLIGHT] large editorial copy that lands opposite the docked phone.
// It reuses the caption timing contract: appear at `at`, hold, then leave.
export const SpotlightView: React.FC<{ spotlight: Spotlight; sec: number }> = ({
  spotlight,
  sec,
}) => {
  const { at, hold, side, kicker, title } = spotlight
  const since = sec - at
  const total = hold + FADE_SEC
  if (since < 0 || since > total) {
    return null
  }

  const reveal = interpolate(since, [0, FADE_SEC], [0, 1], { ...clamp, easing: ease })
  const leave = interpolate(since, [hold, total], [0, 1], { ...clamp, easing: ease })
  const presence = Math.min(reveal, 1 - leave)
  const kickerIn = interpolate(since, [0.05, 0.5], [0, 1], { ...clamp, easing: ease })
  const titleIn = interpolate(since, [0.12, 0.68], [0, 1], { ...clamp, easing: ease })
  const ruleIn = interpolate(since, [0.3, 0.95], [0, 1], { ...clamp, easing: ease })
  const lift = interpolate(reveal, [0, 1], [30, 0], clamp)
  const drift = interpolate(leave, [0, 1], [0, -44], clamp)
  const sideStyle: React.CSSProperties =
    side === "left"
      ? { left: 0, right: 850, alignItems: "center", textAlign: "center" }
      : { right: 0, left: 850, alignItems: "center", textAlign: "center" }

  return (
    <div
      style={{
        position: "absolute",
        top: 0,
        bottom: 0,
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        opacity: presence,
        translate: `${drift}px ${lift}px`,
        ...sideStyle,
      }}
    >
      <div
        style={{
          fontFamily: monoFamily,
          fontSize: 28,
          fontWeight: 500,
          letterSpacing: "0.14em",
          color: lime,
          opacity: kickerIn,
          translate: `0px ${interpolate(kickerIn, [0, 1], [16, 0], clamp)}px`,
        }}
      >
        {kicker}
      </div>
      <div
        style={{
          marginTop: 20,
          maxWidth: 820,
          fontFamily: displayFamily,
          fontSize: 118,
          fontWeight: 400,
          lineHeight: 0.95,
          letterSpacing: "-0.01em",
          color: paper,
          textWrap: "balance",
          opacity: titleIn,
          translate: `0px ${interpolate(titleIn, [0, 1], [26, 0], clamp)}px`,
        }}
      >
        {title}
      </div>
      <div
        style={{
          marginTop: 38,
          width: 132,
          height: 3,
          borderRadius: 2,
          background: lime,
          scale: `${ruleIn} 1`,
          transformOrigin: "center",
        }}
      />
    </div>
  )
}
