import { Easing, interpolate, useVideoConfig } from "remotion"
import type { PhoneLayout } from "./camera"
import { monoFamily, sansFamily, typeScale } from "./fonts"
import { body, ink, inkOnLime, lime, paper } from "./theme"
import {
  type BoxItem,
  type CalloutItem,
  type CapItem,
  type CardItem,
  type NoteItem,
  type SpotlightItem,
} from "./timeline"

const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const
const ease = Easing.bezier(0.16, 1, 0.3, 1)
const pop = Easing.bezier(0.34, 1.56, 0.64, 1)
const FADE_SEC = 0.5
const INSET = 120
const CARD_MARGIN = 72
const CARD_GAP = 72
const CARD_WIDTH = 480

/**
 * A stage card stands on the open side of the handset, close beside it and
 * level with the top of the screen. It stops short of the frame edge.
 */
export const stageCardBox = (
  layout: PhoneLayout,
  stageW: number,
): { left: number; top: number; width: number; onLeft: boolean } => {
  const frameLeft = layout.left - layout.bezel
  const frameRight = layout.left + layout.width + layout.bezel
  const roomLeft = frameLeft - CARD_MARGIN - CARD_GAP
  const roomRight = stageW - frameRight - CARD_MARGIN - CARD_GAP
  const onLeft = roomLeft >= roomRight
  const open = Math.max(0, onLeft ? roomLeft : roomRight)
  const width = Math.min(CARD_WIDTH, Math.max(280, open))
  const left = onLeft
    ? Math.max(CARD_MARGIN, frameLeft - CARD_GAP - width)
    : Math.min(stageW - CARD_MARGIN - width, frameRight + CARD_GAP)
  const top = Math.max(96, layout.top + layout.height * 0.1)
  return { left, top, width, onLeft }
}

/** Eased presence 0..1 for a copy primitive, or null when it is not on screen. */
const presenceAt = (sec: number, at: number, hold: number): number | null => {
  const since = sec - at
  if (since < 0 || since > hold + FADE_SEC) {
    return null
  }
  const reveal = interpolate(since, [0, 0.32], [0, 1], { ...clamp, easing: ease })
  const leave = interpolate(since, [hold, hold + FADE_SEC], [0, 1], { ...clamp, easing: ease })
  return Math.min(reveal, 1 - leave)
}

// --- [CARD] -----------------------------------------------------------------

/**
 * One white card. `place=stage` puts it on the stage beside the phone, for copy
 * that belongs to the scene. Otherwise it sits inside the empty part of the phone
 * screen and tracks the camera, so it never drifts off the app.
 */
export const CardView: React.FC<{ item: CardItem; sec: number; layout: PhoneLayout }> = ({
  item,
  sec,
  layout,
}) => {
  const { width } = useVideoConfig()
  const presence = presenceAt(sec, item.at, item.hold)
  if (presence === null) {
    return null
  }
  const rise = (1 - presence) * 18
  if (item.place === "stage") {
    // The card pops up beside the phone like a sign held up, a little
    // crooked. It leaves by sliding away from the phone as the camera goes in.
    const box = stageCardBox(layout, width)
    const since = sec - item.at
    const away = box.onLeft ? -1 : 1
    const gone = interpolate(since, [item.hold, item.hold + FADE_SEC], [0, 1], {
      ...clamp,
      easing: Easing.bezier(0.5, 0, 0.8, 0.4),
    })
    // Tilted away from the phone. It straightens as it lands and tips as it goes.
    const tilt = interpolate(since, [0, 0.46], [9, 2.2], { ...clamp, easing: pop }) + gone * 4
    return (
      <div
        style={{
          position: "absolute",
          top: box.top,
          width: box.width,
          left: box.left,
          transformOrigin: box.onLeft ? "100% 70%" : "0% 70%",
          opacity: Math.min(interpolate(since, [0, 0.14], [0, 1], clamp), 1 - gone),
          translate: `${away * gone * 90}px 0px`,
          scale: interpolate(since, [0, 0.46], [0.78, 1], { ...clamp, easing: pop }),
          rotate: `${away * tilt}deg`,
          pointerEvents: "none",
        }}
      >
        <div
          style={{
            background: paper,
            color: ink,
            borderRadius: 2,
            padding: "34px 38px 38px",
            borderTop: `14px solid ${lime}`,
            boxShadow: "0 34px 80px rgba(0,0,0,0.6), 0 6px 18px rgba(0,0,0,0.35)",
          }}
        >
          <div
            style={{
              fontFamily: sansFamily,
              fontSize: 62,
              fontWeight: 700,
              lineHeight: 0.96,
              letterSpacing: "-0.045em",
              textWrap: "balance",
            }}
          >
            {item.title}
          </div>
        </div>
      </div>
    )
  }
  // Inside the screen: a card the camera carries with the app.
  return (
    <div
      style={{
        position: "absolute",
        left: layout.left + layout.width * 0.06,
        top: layout.top + layout.height * 0.16,
        width: layout.width * 0.88,
        opacity: presence,
        translate: `0px ${rise * 0.5}px`,
        pointerEvents: "none",
      }}
    >
      <div
        style={{
          background: paper,
          color: ink,
          borderRadius: 2,
          padding: "22px 24px",
          borderLeft: `10px solid ${lime}`,
          boxShadow: "0 18px 40px rgba(0,0,0,0.5)",
        }}
      >
        <div
          style={{
            fontFamily: sansFamily,
            fontSize: Math.max(22, Math.round(layout.width * 0.072)),
            fontWeight: 700,
            lineHeight: 1.02,
            letterSpacing: "-0.03em",
          }}
        >
          {item.title}
        </div>
      </div>
    </div>
  )
}

// --- [CALLOUT] --------------------------------------------------------------

const CALL_H = 268
const HOLE = 30
const CALLOUT_MARGIN = 28

export type CalloutBox = {
  left: number
  top: number
  width: number
  height: number
}

export type CalloutCardBoxParams = {
  compact: boolean
  placement: "target" | "edge"
  side: "left" | "right"
  anchorX: number
  anchorY: number
  layout: PhoneLayout
  stageW: number
  stageH: number
}

/** The tag box. It stays on stage and off the handset, shrinking when the side is tight. */
export const calloutCardBox = (params: CalloutCardBoxParams): CalloutBox => {
  const { compact, placement, side, anchorX, anchorY, layout, stageW, stageH } = params
  const frameLeft = layout.left - layout.bezel
  const frameRight = layout.left + layout.width + layout.bezel
  const right = side === "right"
  const preferred = compact ? 500 : 580
  const open = right ? stageW - frameRight : frameLeft
  const fitted = Math.max(0, open - CALLOUT_MARGIN * 2)
  const width = Math.min(preferred, Math.max(160, fitted))
  const gap = compact ? 48 : 72
  const parked = right ? frameRight + CALLOUT_MARGIN : frameLeft - CALLOUT_MARGIN - width
  const beside = right ? anchorX + gap : anchorX - gap - width
  const wanted = placement === "edge" ? parked : beside
  const left = right
    ? Math.min(stageW - width - CALLOUT_MARGIN, Math.max(wanted, frameRight + CALLOUT_MARGIN))
    : Math.max(CALLOUT_MARGIN, Math.min(wanted, frameLeft - CALLOUT_MARGIN - width))
  const anchorTop = placement === "edge" ? anchorY - CALL_H / 2 : anchorY + 80
  const top = Math.min(Math.max(anchorTop, CALLOUT_MARGIN), stageH - CALL_H - CALLOUT_MARGIN)
  return { left, top, width, height: CALL_H }
}

/** Half the height of the T bracket: it brackets the control, not the pane. */
const ARM = 66
/** How far the bracket's caps reach back towards the phone frame. */
const CAP = 16

/**
 * [CALLOUT] a lime tag tied to a control, with a drawn leader line and a pulsing
 * target. The target is the first tap of the shot unless the script overrode it
 * with targetX/targetY; it arrives here already resolved.
 *
 * `compact placement=edge` sits the tag beside the phone instead of beside the
 * control, and `connector=T` swaps the string for a T-bracket outside the frame.
 */
export const CalloutView: React.FC<{ item: CalloutItem; sec: number; layout: PhoneLayout }> = ({
  item,
  sec,
  layout,
}) => {
  const { width: stageW, height: stageH } = useVideoConfig()
  const { at, hold, eyebrow, title, hint, side, compact, placement, connector, target } = item
  const since = sec - at
  const total = hold + FADE_SEC
  if (since < 0 || since > total) {
    return null
  }
  const presence = Math.min(
    interpolate(since, [0, 0.28], [0, 1], { ...clamp, easing: ease }),
    1 - interpolate(since, [hold, total], [0, 1], { ...clamp, easing: ease }),
  )
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
  const leave = interpolate(since, [hold, total], [0, 1], { ...clamp, easing: ease })
  const translateY = drop - leave * 54
  const rotate = tilt + swing - leave * 4

  const anchorX = layout.left + target.x * layout.width
  const anchorY = layout.top + target.y * layout.height
  const right = side === "right"
  const box = calloutCardBox({
    compact,
    placement,
    side,
    anchorX,
    anchorY,
    layout,
    stageW,
    stageH,
  })
  const cardW = box.width
  const cardLeft = box.left
  const cardTop = box.top
  const holeX = right ? cardLeft + HOLE : cardLeft + cardW - HOLE
  const holeY = cardTop + HOLE
  const holeNow = holeY + translateY
  const isT = connector === "t"
  const tagEdgeX = right ? cardLeft : cardLeft + cardW
  const armY = Math.min(Math.max(anchorY, cardTop + 28), cardTop + CALL_H - 28)
  const tagCenterY = armY + translateY
  // The T bracket has to sit between the tag and the phone. When the tag is
  // pushed to the stage edge it can end up past the frame edge, so the bracket
  // is kept clear of the tag on one side and on the stage on the other.
  const frameEdge = right
    ? layout.left + layout.width + layout.bezel
    : layout.left - layout.bezel
  const between = right ? (frameEdge + cardLeft) / 2 : (cardLeft + cardW + frameEdge) / 2
  const tX = right
    ? Math.min(cardLeft - 8, Math.max(frameEdge + 8, between))
    : Math.max(cardLeft + cardW + 8, Math.min(frameEdge - 8, between))
  const spanTop = anchorY - ARM
  const spanBottom = anchorY + ARM
  const hDraw = interpolate(since, [0.05, 0.45], [0, 1], { ...clamp, easing: ease })
  const vDraw = interpolate(since, [0.35, 0.72], [0, 1], { ...clamp, easing: ease })
  const originX = isT ? (right ? 0 : cardW) : right ? HOLE : cardW - HOLE
  const originY = isT ? CALL_H / 2 : HOLE
  const dir = right ? 1 : -1
  const string = `M ${anchorX} ${anchorY} C ${anchorX + dir * 70} ${anchorY + 20}, ${holeX - dir * 40} ${holeNow - 30}, ${holeX} ${holeNow}`
  const pulsePhase = since > 0.3 ? ((since - 0.3) % 0.9) / 0.9 : 0

  return (
    <>
      <svg
        width={stageW}
        height={stageH}
        style={{ position: "absolute", inset: 0, overflow: "visible", pointerEvents: "none" }}
      >
        {isT ? (
          <>
            {/* The leader: from the tag back to the bracket. */}
            <line
              x1={tagEdgeX}
              y1={tagCenterY}
              x2={tX}
              y2={tagCenterY}
              pathLength={1}
              stroke={lime}
              strokeWidth={4}
              strokeLinecap="round"
              strokeDasharray="1"
              strokeDashoffset={1 - hDraw}
              opacity={0.9 * presence}
            />
            {/* The spine: brackets the control, centred on the anchor. */}
            <line
              x1={tX}
              y1={spanTop}
              x2={tX}
              y2={spanBottom}
              pathLength={1}
              stroke={lime}
              strokeWidth={4}
              strokeLinecap="round"
              strokeDasharray="1"
              strokeDashoffset={1 - vDraw}
              opacity={0.9 * presence}
            />
            {/* The caps point at the phone, so the bracket reads as aimed at it. */}
            {[spanTop, spanBottom].map((y) => (
              <line
                key={y}
                x1={tX}
                y1={y}
                x2={tX - dir * CAP}
                y2={y}
                pathLength={1}
                stroke={lime}
                strokeWidth={4}
                strokeLinecap="round"
                strokeDasharray="1"
                strokeDashoffset={1 - vDraw}
                opacity={0.9 * presence}
              />
            ))}
          </>
        ) : (
          <>
            <path
              d={string}
              pathLength={1}
              stroke={lime}
              strokeWidth={4}
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
              r={18 * (1 + 0.9 * pulsePhase)}
              fill="none"
              stroke={lime}
              strokeWidth={2}
              opacity={0.5 * (1 - pulsePhase) * dotIn * (1 - leave)}
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
          height: CALL_H,
          background: lime,
          border: `3px solid ${ink}`,
          borderRadius: 4,
          boxShadow: "0 24px 60px rgba(0,0,0,0.5)",
          color: inkOnLime,
          opacity: presence,
          pointerEvents: "none",
          translate: `0px ${translateY}px`,
          rotate: `${rotate}deg`,
          transformOrigin: `${originX}px ${originY}px`,
          padding: right ? "22px 26px 22px 66px" : "22px 66px 22px 26px",
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
              fontSize: typeScale.label,
              fontWeight: 700,
              letterSpacing: "0.22em",
              opacity: 0.62,
            }}
          >
            {eyebrow}
          </div>
        ) : null}
        <div
          style={{
            marginTop: eyebrow ? 8 : 0,
            maxWidth: Math.max(120, cardW - 108),
            fontFamily: sansFamily,
            fontSize: Math.min(compact ? 46 : typeScale.lead, Math.max(32, Math.round((cardW - 108) * 0.13))),
            fontWeight: 700,
            lineHeight: 0.94,
            letterSpacing: "-0.04em",
            textWrap: "balance",
          }}
        >
          {title}
        </div>
        {hint ? (
          <div
            style={{
              marginTop: 10,
              maxWidth: Math.max(120, cardW - 108),
              fontFamily: monoFamily,
              fontSize: typeScale.monoSmall,
              lineHeight: 1.32,
              letterSpacing: "0.01em",
              opacity: 0.72,
            }}
          >
            {hint}
          </div>
        ) : null}
      </div>
    </>
  )
}

// --- [SPOTLIGHT] ------------------------------------------------------------

export const SPOT_COLUMN = 580
export const SPOT_INSET = 64

/**
 * [SPOTLIGHT] the large copy card: a mono kicker, a lime rule, a display title.
 * The kicker renders exactly as the script wrote it, sentence case and all.
 */
export const SpotlightView: React.FC<{ item: SpotlightItem; sec: number }> = ({ item, sec }) => {
  const { at, hold, side, kicker, title } = item
  const since = sec - at
  if (since < 0 || since > hold + FADE_SEC) {
    return null
  }
  const enter = interpolate(since, [0, 0.55], [0, 1], { ...clamp, easing: ease })
  const leave = interpolate(since, [hold, hold + FADE_SEC], [0, 1], { ...clamp, easing: ease })
  const presence = Math.min(enter, 1 - leave)
  const rule = interpolate(since, [0.18, 0.72], [0, 1], { ...clamp, easing: ease })
  const titleIn = interpolate(since, [0.24, 0.78], [0, 1], { ...clamp, easing: ease })
  const kickerIn = interpolate(since, [0.05, 0.45], [0, 1], { ...clamp, easing: ease })
  const dir = side === "left" ? -1 : 1
  const slide = (1 - enter) * 90 * dir + leave * 26 * dir
  return (
    <div
      style={{
        position: "absolute",
        top: 0,
        bottom: 0,
        width: SPOT_COLUMN,
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        ...(side === "left" ? { left: SPOT_INSET } : { right: SPOT_INSET }),
        opacity: presence,
        translate: `${slide}px 0px`,
        pointerEvents: "none",
      }}
    >
      <div
        style={{
          fontFamily: monoFamily,
          fontSize: 28,
          fontWeight: 700,
          letterSpacing: "0.22em",
          lineHeight: 1,
          color: lime,
          opacity: kickerIn,
        }}
      >
        {kicker}
      </div>
      <div style={{ marginTop: 28, width: 168 * rule, height: 8, background: lime }} />
      <div
        style={{
          marginTop: 28,
          fontFamily: sansFamily,
          fontSize: typeScale.display,
          fontWeight: 700,
          lineHeight: 0.9,
          letterSpacing: "-0.05em",
          color: paper,
          textWrap: "balance",
          opacity: titleIn,
          translate: `0px ${(1 - titleIn) * 26}px`,
        }}
      >
        {title}
      </div>
    </div>
  )
}

// --- [NOTE] -----------------------------------------------------------------

const NOTE_W = 540

/**
 * [NOTE] one paper note with a lime tape and a rule. It slides out from behind
 * the phone, holds, then slides back. It is drawn under the phone, so the reveal
 * is the phone uncovering it rather than a fade.
 */
export const NoteView: React.FC<{ item: NoteItem; sec: number; layout: PhoneLayout }> = ({
  item,
  sec,
  layout,
}) => {
  const { width: stageW } = useVideoConfig()
  const since = sec - item.at
  if (since < 0 || since > item.hold + FADE_SEC) {
    return null
  }
  const out = interpolate(since, [0, 0.55], [1, 0], { ...clamp, easing: ease })
  const back = interpolate(since, [item.hold, item.hold + FADE_SEC], [0, 1], {
    ...clamp,
    easing: ease,
  })
  const travel = 220
  const right = layout.left + layout.width / 2 < stageW / 2 || layout.left + layout.width + NOTE_W + 96 < stageW
  const restingLeft = right
    ? Math.min(layout.left + layout.width + 44, stageW - NOTE_W - 72)
    : Math.max(layout.left - NOTE_W - 44, 72)
  const offset = (out + back) * travel * (right ? -1 : 1)
  const presence = Math.min(1, 2 - out - back)
  return (
    <div
      style={{
        position: "absolute",
        left: restingLeft + offset,
        top: layout.top + layout.height * 0.3,
        width: NOTE_W,
        opacity: presence,
        rotate: "-1.6deg",
        pointerEvents: "none",
        filter: "drop-shadow(0 30px 60px rgba(0,0,0,0.6))",
      }}
    >
      <div
        style={{
          background: "#F7F3E7",
          color: ink,
          borderRadius: 2,
          padding: "56px 40px 40px",
          position: "relative",
        }}
      >
        <div
          style={{
            position: "absolute",
            left: 30,
            top: -16,
            padding: "10px 16px 9px",
            background: lime,
            color: inkOnLime,
            fontFamily: monoFamily,
            fontSize: typeScale.label,
            fontWeight: 700,
            letterSpacing: "0.22em",
            transform: "rotate(-2deg)",
            boxShadow: "0 6px 14px rgba(0,0,0,0.25)",
          }}
        >
          {item.label}
        </div>
        <div style={{ height: 8, background: lime, marginBottom: 26 }} />
        <div
          style={{
            fontFamily: sansFamily,
            fontSize: typeScale.title,
            fontWeight: 700,
            lineHeight: 0.94,
            letterSpacing: "-0.045em",
            textWrap: "balance",
          }}
        >
          {item.title}
        </div>
      </div>
    </div>
  )
}

// --- [BOX] ------------------------------------------------------------------

/**
 * [BOX] a lime box that frames the first control, then moves to the next one
 * while the card text swaps. No scene in the current script uses it; it is here
 * because the vocabulary is.
 */
export const BoxView: React.FC<{ item: BoxItem; sec: number; layout: PhoneLayout }> = ({
  item,
  sec,
  layout,
}) => {
  const since = sec - item.at
  if (since < 0 || since > item.hold + FADE_SEC) {
    return null
  }
  const steps = item.steps
  if (steps.length === 0) {
    return null
  }
  let active = 0
  for (let index = 0; index < steps.length; index += 1) {
    if (sec >= steps[index].at) {
      active = index
    }
  }
  const step = steps[active]
  const moveFrom = active === 0 ? steps[0] : steps[active - 1]
  const moveT = interpolate(since, [step.at - item.at, step.at - item.at + 0.45], [0, 1], {
    ...clamp,
    easing: ease,
  })
  const x = moveFrom.x + (step.x - moveFrom.x) * (active === 0 ? 1 : moveT)
  const y = moveFrom.y + (step.y - moveFrom.y) * (active === 0 ? 1 : moveT)
  const boxW = layout.width * 0.52
  const boxH = layout.height * 0.045
  const presence = presenceAt(sec, item.at, item.hold) ?? 0
  return (
    <>
      <div
        style={{
          position: "absolute",
          left: layout.left + x * layout.width - boxW / 2,
          top: layout.top + y * layout.height - boxH / 2,
          width: boxW,
          height: boxH,
          border: `4px solid ${lime}`,
          borderRadius: 2,
          opacity: presence,
          pointerEvents: "none",
        }}
      />
      <div
        style={{
          position: "absolute",
          left: INSET,
          top: 120,
          width: 480,
          padding: "28px 32px",
          background: paper,
          color: ink,
          borderRadius: 2,
          borderTop: `12px solid ${lime}`,
          fontFamily: sansFamily,
          fontSize: typeScale.lead,
          fontWeight: 700,
          letterSpacing: "-0.03em",
          opacity: presence,
          pointerEvents: "none",
        }}
      >
        {step.title}
      </div>
    </>
  )
}

// --- [CAP] ------------------------------------------------------------------

/**
 * [CAP] the fallback bottom caption. No scene uses it: the script's copy always
 * has somewhere better to sit. It stays because the vocabulary names it.
 */
export const CapView: React.FC<{ item: CapItem; sec: number }> = ({ item, sec }) => {
  const { height } = useVideoConfig()
  const presence = presenceAt(sec, item.at, item.hold)
  if (presence === null) {
    return null
  }
  return (
    <div
      style={{
        position: "absolute",
        left: 0,
        right: 0,
        bottom: height * 0.07,
        display: "flex",
        justifyContent: "center",
        opacity: presence,
        pointerEvents: "none",
      }}
    >
      <div
        style={{
          background: "#000",
          borderTop: `8px solid ${lime}`,
          borderRadius: 2,
          padding: "18px 28px",
          fontFamily: monoFamily,
          fontSize: typeScale.monoSmall,
          letterSpacing: "0.04em",
          color: body,
        }}
      >
        {item.text}
      </div>
    </div>
  )
}

