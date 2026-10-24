import { Easing, interpolate } from "remotion"
import { displayFamily, monoFamily } from "./fonts"
import { ink, lime, paper } from "./theme"
import { type Note } from "./timeline"

const CARD_W = 520
const CARD_H = 220
const LEFT = 280
const TOP = 430
const FADE_SEC = 0.55
const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const
const ease = Easing.bezier(0.16, 1, 0.3, 1)
const slideEase = Easing.bezier(0.16, 1.2, 0.3, 1)

// [NOTE] one paper note with a lime tape and rule. It slides out from behind
// the phone, carries a single line, then slides back.
export const NoteView: React.FC<{ note: Note; sec: number }> = ({ note, sec }) => {
  const { at, hold, label, title } = note
  const since = sec - at
  const total = hold + FADE_SEC
  if (since < 0 || since > total) {
    return null
  }

  const progress = interpolate(since, [0, 0.5], [0, 1], { ...clamp, easing: slideEase })
  const leave = interpolate(since, [hold, total], [0, 1], { ...clamp, easing: ease })
  const opacity = progress * (1 - leave)
  const x = -140 * (1 - progress) - 140 * leave
  const tilt = interpolate(progress, [0, 0.65, 1], [-9, -1.2, -2.5], {
    ...clamp,
    easing: ease,
  })
  const swing = Math.sin(since * 3.2 + 0.5) * 1.2 * Math.exp(-since * 0.7)
  const rotate = tilt + swing - leave * 4
  const titleIn = interpolate(since, [0.12, 0.4], [0, 1], { ...clamp, easing: ease })
  const ruleIn = interpolate(since, [0.4, 0.75], [0, 1], { ...clamp, easing: ease })

  return (
    <div
      style={{
        position: "absolute",
        left: LEFT,
        top: TOP,
        width: CARD_W,
        height: CARD_H,
        borderRadius: 18,
        background: paper,
        border: "1px solid rgba(8,10,13,0.12)",
        boxShadow: "0 30px 80px rgba(0,0,0,0.55)",
        opacity,
        translate: `${x}px 0px`,
        rotate: `${rotate}deg`,
        pointerEvents: "none",
      }}
    >
      <div
        style={{
          position: "absolute",
          left: 36,
          top: -15,
          width: 208,
          height: 30,
          boxSizing: "border-box",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "0px 12px",
          borderRadius: 4,
          background: lime,
          rotate: "-6deg",
          boxShadow: "0 6px 18px rgba(0,0,0,0.35)",
          fontFamily: monoFamily,
          fontSize: 13,
          fontWeight: 600,
          letterSpacing: "0.14em",
          color: ink,
          whiteSpace: "nowrap",
          textTransform: "uppercase",
        }}
      >
        {label}
      </div>
      <div
        style={{
          height: "100%",
          boxSizing: "border-box",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          padding: "0px 44px",
          color: ink,
        }}
      >
        <div
          style={{
            maxWidth: 432,
            fontFamily: displayFamily,
            fontSize: 44,
            fontWeight: 400,
            lineHeight: 0.95,
            letterSpacing: "-0.01em",
            opacity: titleIn,
            translate: `0px ${10 * (1 - titleIn)}px`,
          }}
        >
          {title}
        </div>
        <div
          style={{
            marginTop: 20,
            width: 96,
            height: 4,
            borderRadius: 2,
            background: lime,
            scale: `${ruleIn} 1`,
            transformOrigin: "left center",
          }}
        />
      </div>
    </div>
  )
}
