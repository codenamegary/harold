import { Easing, interpolate, useVideoConfig } from "remotion"
import { sansFamily } from "./fonts"
import { phoneScreenRect } from "./phone"
import { ink, lime, paper } from "./theme"
import { type Annotation, type AnnotationRect, type Zoom } from "./timeline"

const CARD_W = 600
const CARD_H = 190
const CARD_TOP = 0.6
const FADE_SEC = 0.55
const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const
const ease = Easing.bezier(0.16, 1, 0.3, 1)

const mixRect = (from: AnnotationRect, to: AnnotationRect, progress: number): AnnotationRect => ({
  x: from.x + (to.x - from.x) * progress,
  y: from.y + (to.y - from.y) * progress,
  w: from.w + (to.w - from.w) * progress,
  h: from.h + (to.h - from.h) * progress,
})

// [BOX] one white caption card in the empty phone area, with a lime box that
// frames the mode control and then slides onto the thinking control.
export const AnnotationView: React.FC<{
  annotation: Annotation
  sec: number
  zoom: Zoom
  videoWidth: number
  videoHeight: number
}> = ({ annotation, sec, zoom, videoWidth, videoHeight }) => {
  const { width: stageW, height: stageH } = useVideoConfig()
  const { at, moveAt, endAt, title, nextTitle, target, nextTarget } = annotation
  if (sec < at || sec > endAt + FADE_SEC) {
    return null
  }

  const since = sec - at
  const screen = phoneScreenRect(sec, stageW, stageH, videoWidth, videoHeight, zoom)
  const reveal = interpolate(since, [0, 0.35], [0, 1], { ...clamp, easing: ease })
  const leave = interpolate(sec, [endAt, endAt + FADE_SEC], [0, 1], {
    ...clamp,
    easing: ease,
  })
  const presence = Math.min(reveal, 1 - leave)
  const moveProgress = interpolate(sec, [moveAt, moveAt + 0.55], [0, 1], {
    ...clamp,
    easing: ease,
  })
  const modeTextOpacity = interpolate(sec, [moveAt - 0.25, moveAt - 0.05], [1, 0], {
    ...clamp,
    easing: ease,
  })
  const nextTextOpacity = interpolate(sec, [moveAt + 0.1, moveAt + 0.35], [0, 1], {
    ...clamp,
    easing: ease,
  })
  const ruleIn = interpolate(since, [0.2, 0.6], [0, 1], { ...clamp, easing: ease })
  const lineDraw = interpolate(since, [0.2, 0.7], [0, 1], { ...clamp, easing: ease })

  const cardLeft = screen.left + screen.width / 2 - CARD_W / 2
  const cardTop = screen.top + screen.height * CARD_TOP
  const boxRect = mixRect(target, nextTarget, moveProgress)
  const box = {
    left: screen.left + boxRect.x * screen.width,
    top: screen.top + boxRect.y * screen.height,
    width: boxRect.w * screen.width,
    height: boxRect.h * screen.height,
  }
  const lineStartX = screen.left + screen.width / 2
  const lineStartY = cardTop + CARD_H
  const lineEndX = box.left + box.width / 2
  const lineEndY = box.top
  const line = `M ${lineStartX} ${lineStartY} C ${lineStartX} ${lineStartY + 70}, ${lineEndX} ${lineEndY - 70}, ${lineEndX} ${lineEndY}`

  return (
    <>
      <svg
        width={stageW}
        height={stageH}
        style={{ position: "absolute", inset: 0, overflow: "visible", pointerEvents: "none" }}
      >
        <path
          d={line}
          pathLength={1}
          stroke={lime}
          strokeWidth={2.5}
          strokeLinecap="round"
          strokeDasharray="1"
          strokeDashoffset={1 - lineDraw}
          fill="none"
          opacity={0.9 * presence}
        />
      </svg>
      <div
        style={{
          position: "absolute",
          left: box.left,
          top: box.top,
          width: box.width,
          height: box.height,
          border: `2px solid ${lime}`,
          borderRadius: 10,
          background: "rgba(182,243,107,0.05)",
          boxShadow: "0 0 24px rgba(182,243,107,0.22)",
          opacity: presence,
          pointerEvents: "none",
        }}
      />
      <div
        style={{
          position: "absolute",
          left: cardLeft,
          top: cardTop,
          width: CARD_W,
          height: CARD_H,
          boxSizing: "border-box",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          padding: "26px 36px 26px 38px",
          borderRadius: 16,
          background: paper,
          border: "1px solid rgba(8,10,13,0.12)",
          borderLeft: `5px solid ${lime}`,
          boxShadow: "0 24px 60px rgba(0,0,0,0.5)",
          color: ink,
          opacity: presence,
          translate: `0px ${10 * (1 - reveal)}px`,
          pointerEvents: "none",
        }}
      >
        <div style={{ position: "relative", height: 80 }}>
          <div
            style={{
              position: "absolute",
              inset: 0,
              fontFamily: sansFamily,
              fontSize: 32,
              fontWeight: 600,
              lineHeight: 1.05,
              letterSpacing: "-0.02em",
              textWrap: "balance",
              opacity: modeTextOpacity,
            }}
          >
            {title}
          </div>
          <div
            style={{
              position: "absolute",
              inset: 0,
              fontFamily: sansFamily,
              fontSize: 32,
              fontWeight: 600,
              lineHeight: 1.05,
              letterSpacing: "-0.02em",
              opacity: nextTextOpacity,
            }}
          >
            {nextTitle}
          </div>
        </div>
        <div
          style={{
            marginTop: 14,
            width: 80,
            height: 4,
            borderRadius: 2,
            background: lime,
            scale: `${ruleIn} 1`,
            transformOrigin: "left center",
          }}
        />
      </div>
    </>
  )
}
