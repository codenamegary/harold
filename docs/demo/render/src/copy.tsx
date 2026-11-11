import { Easing, interpolate, useVideoConfig } from "remotion"
import type { PhoneLayout } from "./camera"
import { monoFamily, sansFamily } from "./fonts"
import { body, ink, inkOnLime, lime, lineSoft, paper } from "./theme"
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
const FADE_SEC = 0.5
const INSET = 96

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
  const { width, height } = useVideoConfig()
  const presence = presenceAt(sec, item.at, item.hold)
  if (presence === null) {
    return null
  }
  const rise = (1 - presence) * 18
  if (item.place === "stage") {
    const phoneRight = layout.left + layout.width
    // Sit opposite the phone, and never across it.
    const roomLeft = layout.left - 24
    const roomRight = width - phoneRight - 24
    const onLeft = roomLeft >= 540 || roomLeft > roomRight
    return (
      <div
        style={{
          position: "absolute",
          top: height * 0.3,
          width: 500,
          ...(onLeft ? { left: INSET } : { right: INSET }),
          opacity: presence,
          translate: `0px ${rise}px`,
          pointerEvents: "none",
        }}
      >
        <div
          style={{
            background: paper,
            color: ink,
            borderRadius: 18,
            padding: "32px 34px 32px 30px",
            borderTop: `6px solid ${lime}`,
            boxShadow: "0 34px 90px rgba(0,0,0,0.62)",
          }}
        >
          <div
            style={{
              fontFamily: sansFamily,
              fontSize: 48,
              fontWeight: 600,
              lineHeight: 0.98,
              letterSpacing: "-0.035em",
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
          borderRadius: 14,
          padding: "18px 20px",
          borderLeft: `4px solid ${lime}`,
          boxShadow: "0 20px 50px rgba(0,0,0,0.55)",
        }}
      >
        <div
          style={{
            fontFamily: sansFamily,
            fontSize: Math.max(15, Math.round(layout.width * 0.062)),
            fontWeight: 600,
            lineHeight: 1.05,
            letterSpacing: "-0.02em",
          }}
        >
          {item.title}
        </div>
      </div>
    </div>
  )
}

// --- [CALLOUT] --------------------------------------------------------------

const CALL_H = 196
const HOLE = 30
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
  const cardW = compact ? 420 : 500
  const gap = compact ? 44 : 70
  const right = side === "right"
  const edgeLeft = right ? layout.left + layout.width + gap : layout.left - gap - cardW
  const targetLeft = right ? anchorX + gap : anchorX - gap - cardW
  // A tag beside its control can land on the phone when the control sits near
  // the frame edge. Push it clear of the phone — by the layout gap, so a T
  // bracket still has an arm — and then keep it on the stage.
  const wanted = placement === "edge" ? edgeLeft : targetLeft
  const clearance = placement === "edge" ? gap : 14
  const clearOfPhone = right
    ? Math.max(wanted, layout.left + layout.width + clearance)
    : Math.min(wanted, layout.left - clearance - cardW)
  const cardLeft = Math.min(Math.max(clearOfPhone, 24), stageW - cardW - 24)
  const anchorTop = placement === "edge" ? anchorY - CALL_H / 2 : anchorY + 80
  const cardTop = Math.min(Math.max(anchorTop, 24), stageH - CALL_H - 24)
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
  const rawT = right
    ? layout.left + layout.width + layout.bezel + 10
    : layout.left - layout.bezel - 10
  const tX = right
    ? Math.min(Math.max(rawT, layout.left + layout.width + 2), cardLeft - 8)
    : Math.max(Math.min(rawT, layout.left - 2), cardLeft + cardW + 8)
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
              strokeWidth={2.5}
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
              strokeWidth={2.5}
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
                strokeWidth={2.5}
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
          border: `2px solid ${ink}`,
          borderRadius: 20,
          boxShadow: "0 28px 80px rgba(0,0,0,0.55), 0 1px 0 rgba(255,255,255,0.3) inset",
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
            marginTop: eyebrow ? 8 : 0,
            maxWidth: compact ? 340 : 400,
            fontFamily: sansFamily,
            fontSize: compact ? 36 : 40,
            fontWeight: 600,
            lineHeight: 0.98,
            letterSpacing: "-0.035em",
            textWrap: "balance",
          }}
        >
          {title}
        </div>
        {hint ? (
          <div
            style={{
              marginTop: 10,
              maxWidth: compact ? 340 : 400,
              fontFamily: monoFamily,
              fontSize: 18,
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

const SPOT_COLUMN = 640

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
        ...(side === "left" ? { left: INSET } : { right: INSET }),
        opacity: presence,
        translate: `${slide}px 0px`,
        pointerEvents: "none",
      }}
    >
      <div
        style={{
          fontFamily: monoFamily,
          fontSize: 26,
          fontWeight: 500,
          letterSpacing: "0.16em",
          lineHeight: 1,
          color: lime,
          opacity: kickerIn,
        }}
      >
        {kicker}
      </div>
      <div style={{ marginTop: 22, width: 116 * rule, height: 3, background: lime }} />
      <div
        style={{
          marginTop: 30,
          fontFamily: sansFamily,
          fontSize: 96,
          fontWeight: 600,
          lineHeight: 0.94,
          letterSpacing: "-0.045em",
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

const NOTE_W = 470

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
          borderRadius: 6,
          padding: "44px 34px 34px",
          position: "relative",
        }}
      >
        <div
          style={{
            position: "absolute",
            left: 30,
            top: -16,
            padding: "8px 14px 7px",
            background: lime,
            color: inkOnLime,
            fontFamily: monoFamily,
            fontSize: 15,
            fontWeight: 600,
            letterSpacing: "0.2em",
            transform: "rotate(-2deg)",
            boxShadow: "0 6px 14px rgba(0,0,0,0.25)",
          }}
        >
          {item.label}
        </div>
        <div style={{ height: 3, background: lime, marginBottom: 22 }} />
        <div
          style={{
            fontFamily: sansFamily,
            fontSize: 44,
            fontWeight: 600,
            lineHeight: 0.98,
            letterSpacing: "-0.035em",
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
          border: `3px solid ${lime}`,
          borderRadius: 12,
          opacity: presence,
          pointerEvents: "none",
        }}
      />
      <div
        style={{
          position: "absolute",
          left: INSET,
          top: 120,
          width: 420,
          padding: "20px 24px",
          background: paper,
          color: ink,
          borderRadius: 12,
          fontFamily: sansFamily,
          fontSize: 32,
          fontWeight: 600,
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
          background: "rgba(8,10,13,0.92)",
          border: `1px solid ${lineSoft}`,
          borderRadius: 8,
          padding: "14px 22px",
          fontFamily: monoFamily,
          fontSize: 22,
          letterSpacing: "0.04em",
          color: body,
        }}
      >
        {item.text}
      </div>
    </div>
  )
}

