import { Easing, interpolate, useVideoConfig } from "remotion"
import { displayFamily, monoFamily } from "./fonts"
import { phoneScreenRect } from "./phone"
import { ink, inkOnLime, lime } from "./theme"
import { type Callout, type Zoom } from "./timeline"

const CARD_H = 196
const HOLE = 30
const FADE_SEC = 0.55
const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const
const ease = Easing.bezier(0.16, 1, 0.3, 1)

// [CALLOUT] a lime tag tied to the control the next tap lands on. The tag
// drops in, swings on its string, and holds while the user acts.
export const CalloutView: React.FC<{
  callout: Callout
  sec: number
  zoom: Zoom
  videoWidth: number
  videoHeight: number
}> = ({ callout, sec, zoom, videoWidth, videoHeight }) => {
  const { width: stageW, height: stageH } = useVideoConfig()
  const {
    at,
    hold,
    eyebrow,
    title,
    hint,
    side,
    targetX,
    targetY,
    compact,
    placement,
    connector,
    span,
  } = callout
  const since = sec - at
  const total = hold + FADE_SEC
  if (since < 0 || since > total) {
    return null
  }

  const reveal = interpolate(since, [0, 0.28], [0, 1], { ...clamp, easing: ease })
  const leave = interpolate(since, [hold, total], [0, 1], { ...clamp, easing: ease })
  const presence = Math.min(reveal, 1 - leave)
  const draw = interpolate(since, [0.05, 0.5], [0, 1], { ...clamp, easing: ease })
  const dotIn = interpolate(since, [0, 0.2], [0, 1], clamp)
  const drop = interpolate(since, [0, 0.18, 0.34, 0.5], [-90, 14, -5, 0], {
    ...clamp,
    easing: ease,
  })
  const tilt = interpolate(since, [0, 0.18, 0.34, 0.5], [-12, 4, -2, 1.5], {
    ...clamp,
    easing: ease,
  })
  const swing = Math.sin(since * 4.2 + 0.2) * 3 * Math.exp(-since * 0.8)
  const liftOut = interpolate(leave, [0, 1], [0, -54], clamp)
  const translateY = drop + liftOut
  const rotate = tilt + swing - leave * 4

  const screen = phoneScreenRect(sec, stageW, stageH, videoWidth, videoHeight, zoom)
  const anchorX = screen.left + targetX * screen.width
  const anchorY = screen.top + targetY * screen.height

  const cardW = compact ? 480 : 560
  const gap = compact ? 56 : 84
  const right = side === "right"
  const edgeLeft = right ? screen.left + screen.width + gap : screen.left - gap - cardW
  const targetLeft = right ? anchorX + gap : anchorX - gap - cardW
  const cardLeft = Math.min(
    Math.max(placement === "edge" ? edgeLeft : targetLeft, 32),
    stageW - cardW - 32,
  )
  const anchorTop = placement === "edge" ? anchorY - CARD_H / 2 : anchorY + 70
  const cardTop = Math.min(Math.max(anchorTop, 32), stageH - CARD_H - 32)
  const holeX = right ? cardLeft + HOLE : cardLeft + cardW - HOLE
  const holeY = cardTop + HOLE
  const holeNow = holeY + translateY
  const isT = connector === "t"
  const tagEdgeX = right ? cardLeft : cardLeft + cardW
  const tagCenterY = cardTop + CARD_H / 2 + translateY
  const tX = right
    ? screen.left + screen.width + screen.frameBezel + 8
    : screen.left - screen.frameBezel - 8
  const spanTop = screen.top + (span?.y ?? 0.52) * screen.height
  const spanBottom = spanTop + (span?.h ?? 0.42) * screen.height
  const hDraw = interpolate(since, [0.05, 0.45], [0, 1], { ...clamp, easing: ease })
  const vDraw = interpolate(since, [0.4, 0.9], [0, 1], { ...clamp, easing: ease })
  const originX = isT ? (right ? 0 : cardW) : right ? HOLE : cardW - HOLE
  const originY = isT ? CARD_H / 2 : HOLE
  const dir = right ? 1 : -1
  const string = `M ${anchorX} ${anchorY} C ${anchorX + dir * 70} ${anchorY + 20}, ${holeX - dir * 40} ${holeNow - 30}, ${holeX} ${holeNow}`
  const pulsePhase = since > 0.3 ? ((since - 0.3) % 0.9) / 0.9 : 0
  const pulseScale = 1 + 0.9 * pulsePhase
  const pulseOpacity = 0.5 * (1 - pulsePhase) * dotIn * (1 - leave)

  return (
    <>
      <svg
        width={stageW}
        height={stageH}
        style={{ position: "absolute", inset: 0, overflow: "visible", pointerEvents: "none" }}
      >
        {isT ? (
          <>
            <line
              x1={tagEdgeX}
              y1={tagCenterY}
              x2={tX}
              y2={tagCenterY}
              pathLength={1}
              stroke={lime}
              strokeWidth={2.5}
              strokeLinecap="round"
              strokeDasharray="1"
              strokeDashoffset={1 - hDraw}
              opacity={0.9 * presence}
            />
            <line
              x1={tX}
              y1={tagCenterY}
              x2={tX}
              y2={spanTop}
              pathLength={1}
              stroke={lime}
              strokeWidth={2.5}
              strokeLinecap="round"
              strokeDasharray="1"
              strokeDashoffset={1 - vDraw}
              opacity={0.9 * presence}
            />
            <line
              x1={tX}
              y1={tagCenterY}
              x2={tX}
              y2={spanBottom}
              pathLength={1}
              stroke={lime}
              strokeWidth={2.5}
              strokeLinecap="round"
              strokeDasharray="1"
              strokeDashoffset={1 - vDraw}
              opacity={0.9 * presence}
            />
          </>
        ) : (
          <>
            <path
              d={string}
              pathLength={1}
              stroke={lime}
              strokeWidth={2.5}
              strokeLinecap="round"
              strokeDasharray="1"
              strokeDashoffset={1 - draw}
              fill="none"
              opacity={0.9 * presence}
            />
            <circle
              cx={anchorX}
              cy={anchorY}
              r={7 * dotIn}
              fill={lime}
              stroke={ink}
              strokeWidth={2}
              opacity={presence}
            />
            <circle
              cx={anchorX}
              cy={anchorY}
              r={18 * pulseScale}
              fill="none"
              stroke={lime}
              strokeWidth={2}
              opacity={pulseOpacity}
            />
          </>
        )}
      </svg>
      <div
        style={{
          position: "absolute",
          left: cardLeft,
          top: cardTop,
          width: cardW,
          height: CARD_H,
          background: lime,
          border: `2px solid ${ink}`,
          borderRadius: 20,
          boxShadow: "0 28px 80px rgba(0,0,0,0.55), 0 1px 0 rgba(255,255,255,0.3) inset",
          color: inkOnLime,
          opacity: presence,
          pointerEvents: "none",
          translate: `0px ${translateY}px`,
          rotate: `${rotate}deg`,
          transformOrigin: `${originX}px ${originY}px`,
          padding: right ? "24px 28px 24px 70px" : "24px 70px 24px 28px",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          alignItems: right ? "flex-start" : "flex-end",
          textAlign: right ? "left" : "right",
        }}
      >
        {isT ? null : (
          <div
            style={{
              position: "absolute",
              left: holeX - cardLeft - 6,
              top: HOLE - 6,
              width: 12,
              height: 12,
              borderRadius: 999,
              background: ink,
              boxShadow: "inset 0 2px 3px rgba(255,255,255,0.18)",
            }}
          />
        )}
        {eyebrow ? (
          <div
            style={{
              fontFamily: monoFamily,
              fontSize: 15,
              fontWeight: 600,
              letterSpacing: "0.18em",
              opacity: 0.62,
            }}
          >
            {eyebrow}
          </div>
        ) : null}
        <div
          style={{
            marginTop: eyebrow ? 6 : 0,
            maxWidth: compact ? 382 : 462,
            fontFamily: displayFamily,
            fontSize: compact ? 42 : 46,
            fontWeight: 400,
            lineHeight: 0.92,
            letterSpacing: "-0.01em",
            textWrap: "balance",
          }}
        >
          {title}
        </div>
        {hint ? (
          <div
            style={{
              marginTop: 8,
              fontFamily: monoFamily,
              fontSize: 14,
              letterSpacing: "0.01em",
              opacity: 0.62,
            }}
          >
            {hint}
          </div>
        ) : null}
      </div>
    </>
  )
}
