import { Easing, interpolate, useVideoConfig } from "remotion"
import { CardFace } from "./cardFace"
import { phoneScreenRect } from "./phone"
import { type PhoneCaption, type Zoom } from "./timeline"

const CARD_W = 600
const FADE_SEC = 0.55
const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const
const ease = Easing.bezier(0.16, 1, 0.3, 1)

// [CARD] one white caption card inside the phone screen, using the empty area
// of the current app screen.
export const PhoneCardView: React.FC<{
  caption: PhoneCaption
  sec: number
  zoom: Zoom
  videoWidth: number
  videoHeight: number
}> = ({ caption, sec, zoom, videoWidth, videoHeight }) => {
  const { width: stageW, height: stageH } = useVideoConfig()
  const { at, hold, title, top, height } = caption
  const since = sec - at
  if (since < 0 || since > hold + FADE_SEC) {
    return null
  }

  const screen = phoneScreenRect(sec, stageW, stageH, videoWidth, videoHeight, zoom)
  const reveal = interpolate(since, [0, 0.35], [0, 1], { ...clamp, easing: ease })
  const leave = interpolate(since, [hold, hold + FADE_SEC], [0, 1], {
    ...clamp,
    easing: ease,
  })
  const presence = Math.min(reveal, 1 - leave)
  const ruleIn = interpolate(since, [0.2, 0.6], [0, 1], { ...clamp, easing: ease })
  const cardLeft = screen.left + screen.width / 2 - CARD_W / 2
  const cardTop = screen.top + top * screen.height

  return (
    <div
      style={{
        position: "absolute",
        left: cardLeft,
        top: cardTop,
        width: CARD_W,
        height,
        opacity: presence,
        translate: `0px ${10 * (1 - reveal)}px`,
        pointerEvents: "none",
      }}
    >
      <CardFace title={title} width={CARD_W} height={height} fontSize={32} ruleIn={ruleIn} />
    </div>
  )
}
