import { Easing, interpolate } from "remotion"
import { displayFamily, monoFamily } from "./fonts"
import { ink, lime, paper } from "./theme"
import { type CardFan } from "./timeline"

const CARD_W = 500
const CARD_H = 250
const BASE_LEFT = 220
const BASE_TOP = 280
const FADE_SEC = 0.6
const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const
const ease = Easing.bezier(0.16, 1, 0.3, 1)
const fanEase = Easing.bezier(0.16, 1.25, 0.3, 1)

const CARDS = [
  { angle: -17, color: "#8F7CFF", front: false },
  { angle: -12, color: "#55B8FF", front: false },
  { angle: -7, color: "#FF875A", front: false },
  { angle: -2, color: lime, front: true },
]

// [CARDS] paper session cards dealt out from behind the phone. The fan is
// rendered before the phone so the cards genuinely slide out from under it.
export const CardFanView: React.FC<{ fan: CardFan; sec: number }> = ({ fan, sec }) => {
  const { at, hold, eyebrow, title, hint } = fan
  const since = sec - at
  const total = hold + FADE_SEC
  if (since < 0 || since > total) {
    return null
  }

  const leave = interpolate(since, [hold, total], [0, 1], { ...clamp, easing: ease })
  const textIn = interpolate(since, [0.25, 0.6], [0, 1], { ...clamp, easing: ease })

  return (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>
      {CARDS.map((card, index) => {
        const progress = interpolate(since, [index * 0.06, index * 0.06 + 0.55], [0, 1], {
          ...clamp,
          easing: fanEase,
        })
        const opacity = progress * (1 - leave)
        const translateX = 120 * (1 - progress) + 110 * leave
        const translateY = 40 * (1 - progress) + 20 * leave
        const rotate = card.angle * progress * (1 - leave)

        return (
          <div
            key={card.angle}
            style={{
              position: "absolute",
              left: BASE_LEFT,
              top: BASE_TOP,
              width: CARD_W,
              height: CARD_H,
              overflow: "hidden",
              borderRadius: 18,
              background: card.front ? paper : "#E7EBF1",
              border: `1.5px solid rgba(8,10,13,${card.front ? 0.18 : 0.1})`,
              boxShadow: card.front
                ? "0 30px 80px rgba(0,0,0,0.6)"
                : "0 18px 50px rgba(0,0,0,0.45)",
              opacity,
              translate: `${translateX}px ${translateY}px`,
              rotate: `${rotate}deg`,
              transformOrigin: "100% 100%",
            }}
          >
            <div style={{ height: 8, background: card.front ? ink : card.color }} />
            {card.front ? (
              <div
                style={{
                  padding: "26px 30px 28px",
                  display: "flex",
                  flexDirection: "column",
                  color: ink,
                }}
              >
                <div
                  style={{
                    alignSelf: "flex-start",
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    padding: "6px 11px",
                    borderRadius: 6,
                    background: lime,
                    fontFamily: monoFamily,
                    fontSize: 13,
                    fontWeight: 600,
                    letterSpacing: "0.14em",
                  }}
                >
                  <span style={{ fontSize: 16, lineHeight: 1 }}>↺</span>
                  {eyebrow}
                </div>
                <div
                  style={{
                    marginTop: 12,
                    maxWidth: 430,
                    fontFamily: displayFamily,
                    fontSize: 40,
                    fontWeight: 400,
                    lineHeight: 0.95,
                    letterSpacing: "-0.01em",
                    opacity: textIn,
                  }}
                >
                  {title}
                </div>
                {hint ? (
                  <div
                    style={{
                      marginTop: 10,
                      fontFamily: monoFamily,
                      fontSize: 14,
                      opacity: 0.6 * textIn,
                    }}
                  >
                    {hint}
                  </div>
                ) : null}
              </div>
            ) : (
              <div
                style={{
                  padding: "22px 26px",
                  display: "flex",
                  flexDirection: "column",
                  gap: 18,
                }}
              >
                {[0, 1, 2].map((row) => (
                  <div
                    key={row}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 12,
                      opacity: 0.24 - row * 0.05,
                    }}
                  >
                    <div
                      style={{
                        width: 22,
                        height: 22,
                        borderRadius: 999,
                        background: card.color,
                      }}
                    />
                    <div style={{ flex: 1 }}>
                      <div
                        style={{
                          width: `${64 - row * 9}%`,
                          height: 8,
                          borderRadius: 4,
                          background: ink,
                        }}
                      />
                      <div
                        style={{
                          marginTop: 6,
                          width: `${42 - row * 6}%`,
                          height: 6,
                          borderRadius: 3,
                          background: ink,
                          opacity: 0.6,
                        }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
