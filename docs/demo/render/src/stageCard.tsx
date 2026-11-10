import { Easing, interpolate, useVideoConfig } from "remotion"
import { CardFace } from "./cardFace"
import { type StageCard } from "./timeline"

const FADE_SEC = 0.55
const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const
const ease = Easing.bezier(0.16, 1, 0.3, 1)

// [CARD] one white caption card placed on the stage around the terminal or
// phone. The card keeps the same paper and lime edge as the in-phone cards.
export const StageCardView: React.FC<{ card: StageCard; sec: number }> = ({ card, sec }) => {
  const { width: stageW, height: stageH } = useVideoConfig()
  const { at, hold, title, x, y, width, height, fontSize } = card
  const since = sec - at
  if (since < 0 || since > hold + FADE_SEC) {
    return null
  }

  const reveal = interpolate(since, [0, 0.35], [0, 1], { ...clamp, easing: ease })
  const leave = interpolate(since, [hold, hold + FADE_SEC], [0, 1], {
    ...clamp,
    easing: ease,
  })
  const presence = Math.min(reveal, 1 - leave)
  const ruleIn = interpolate(since, [0.2, 0.6], [0, 1], { ...clamp, easing: ease })

  return (
    <div
      style={{
        position: "absolute",
        left: x * stageW - width / 2,
        top: y * stageH - height / 2,
        width,
        height,
        opacity: presence,
        translate: `0px ${10 * (1 - reveal)}px`,
        pointerEvents: "none",
      }}
    >
      <CardFace
        title={title}
        width={width}
        height={height}
        fontSize={fontSize}
        ruleIn={ruleIn}
        shadow="none"
      />
    </div>
  )
}
