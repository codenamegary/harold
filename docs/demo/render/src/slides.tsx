import { AbsoluteFill, Easing, interpolate, useVideoConfig } from "remotion"
import { monoFamily, sansFamily } from "./fonts"
import { Mark } from "./mark"
import { LIGHTS, type LightShape } from "./stage"
import { paper } from "./theme"

// The intro and the outro are the only graphics-only scenes. They bookend the
// film with [LIGHT:alone]. The lockup sits in the shaft, in the spotlight,
// and the rest of the frame stays dark. The type is clean. The light does not
// play on it.

export const SUBTITLE = "Hark! The Harold Agents Sing"
export const CTA_HANDLE = "codenamegary/harold"
export const SITE = "harold.codenamegary.com"

/** The title breaks after its third word, so "Hark! The Harold" sits over "Agents Sing". */
const TITLE_BREAK = 3

const TITLE_WORDS = SUBTITLE.split(" ")
const TITLE_LINES = [TITLE_WORDS.slice(0, TITLE_BREAK), TITLE_WORDS.slice(TITLE_BREAK)]

const MARK_SIZE = 128
const TITLE_SIZE = 88
const CTA_SIZE = 32

/** When each part of the lockup starts to arrive, in seconds from the mark. */
const WORDS_AT = 0.2
const WORD_STAGGER = 0.075
const CTA_AT = 0.78
const SITE_AT = 0.95

const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const
const settle = Easing.bezier(0.16, 1, 0.3, 1)
const pop = Easing.bezier(0.34, 1.56, 0.64, 1)

export const LOCKUP_WIDTH = 820

/**
 * Where the lockup sits. High in the shaft, above the pool, centred on the
 * beam. The box is pinned to the `alone` light so the titles stay put while
 * the pool slides toward the phone.
 */
export const lockupBox = (
  light: LightShape,
  width: number,
  height: number,
): { left: number; top: number; width: number } => {
  const poolX = light.centreX * width
  const poolY = light.centreY * height
  const top = Math.max(36, poolY * 0.2)
  const left = Math.min(width - LOCKUP_WIDTH - 48, Math.max(48, poolX - LOCKUP_WIDTH / 2))
  return { left, top, width: LOCKUP_WIDTH }
}

/** The GitHub mark, 24x24. The script's CTA is `:github logo: codenamegary/harold`. */
const GithubMark: React.FC<{ size: number }> = ({ size }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
    <path d="M12 .5C5.73.5.5 5.73.5 12c0 5.08 3.29 9.39 7.86 10.91.58.11.79-.25.79-.56 0-.28-.01-1.02-.02-2-3.2.7-3.88-1.54-3.88-1.54-.53-1.34-1.29-1.7-1.29-1.7-1.05-.72.08-.71.08-.71 1.17.08 1.78 1.2 1.78 1.2 1.03 1.77 2.7 1.26 3.36.96.1-.75.4-1.26.73-1.55-2.55-.29-5.23-1.28-5.23-5.68 0-1.26.45-2.29 1.19-3.09-.12-.29-.52-1.46.11-3.05 0 0 .97-.31 3.18 1.18a11.04 11.04 0 0 1 2.9-.39c.98 0 1.97.13 2.9.39 2.2-1.49 3.17-1.18 3.17-1.18.63 1.59.23 2.76.11 3.05.74.8 1.19 1.83 1.19 3.09 0 4.41-2.69 5.38-5.25 5.67.41.36.78 1.06.78 2.14 0 1.55-.01 2.8-.01 3.18 0 .31.21.68.8.56A11.5 11.5 0 0 0 23.5 12C23.5 5.73 18.27.5 12 .5z" />
  </svg>
)

/** One word of the title. It rises into place and sharpens as it lands. */
const TitleWord: React.FC<{ word: string; sec: number; at: number }> = ({ word, sec, at }) => (
  <span
    style={{
      display: "inline-block",
      opacity: interpolate(sec, [at, at + 0.28], [0, 1], clamp),
      translate: interpolate(sec, [at, at + 0.55], ["0px 0.42em", "0px 0em"], {
        ...clamp,
        easing: settle,
      }),
      filter: `blur(${interpolate(sec, [at, at + 0.35], [10, 0], clamp)}px)`,
    }}
  >
    {word}
  </span>
)

export const Slide: React.FC<{
  variant: "intro" | "outro"
  /** Seconds since the mark lands. Everything else follows it. */
  sec: number
  opacity: number
}> = ({ variant, sec, opacity }) => {
  const { width, height } = useVideoConfig()
  const box = lockupBox(LIGHTS.alone, width, height)
  return (
    <AbsoluteFill style={{ opacity }}>
      <div
        style={{
          position: "absolute",
          left: box.left,
          top: box.top,
          width: box.width,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          textAlign: "center",
        }}
      >
        <div
          style={{
            width: MARK_SIZE,
            height: MARK_SIZE,
            opacity: interpolate(sec, [0, 0.14], [0, 1], clamp),
            scale: interpolate(sec, [0, 0.52], [0.5, 1], { ...clamp, easing: pop }),
            rotate: interpolate(sec, [0, 0.52], ["-16deg", "0deg"], { ...clamp, easing: pop }),
          }}
        >
          <Mark size={MARK_SIZE} />
        </div>
        <div
          style={{
            marginTop: 30,
            fontFamily: sansFamily,
            fontSize: TITLE_SIZE,
            fontWeight: 700,
            lineHeight: 0.98,
            letterSpacing: "-0.05em",
            color: paper,
          }}
        >
          {TITLE_LINES.map((line, lineIndex) => (
            <div key={lineIndex} style={{ display: "flex", justifyContent: "center", gap: "0.24em" }}>
              {line.map((word, wordIndex) => (
                <TitleWord
                  key={word}
                  word={word}
                  sec={sec}
                  at={WORDS_AT + (lineIndex * TITLE_BREAK + wordIndex) * WORD_STAGGER}
                />
              ))}
            </div>
          ))}
        </div>
        <div
          style={{
            marginTop: 36,
            display: "flex",
            alignItems: "center",
            gap: 16,
            padding: "14px 30px 14px 24px",
            borderRadius: 999,
            border: "1.5px solid rgba(242,245,248,0.24)",
            background: "rgba(242,245,248,0.05)",
            color: paper,
            opacity: interpolate(sec, [CTA_AT, CTA_AT + 0.4], [0, 1], clamp),
            translate: interpolate(sec, [CTA_AT, CTA_AT + 0.6], ["0px 16px", "0px 0px"], {
              ...clamp,
              easing: settle,
            }),
          }}
        >
          <GithubMark size={CTA_SIZE + 4} />
          <div style={{ fontFamily: monoFamily, fontSize: CTA_SIZE, letterSpacing: "0.01em" }}>
            {CTA_HANDLE}
          </div>
        </div>
        {variant === "outro" ? (
          <div
            style={{
              marginTop: 24,
              fontFamily: monoFamily,
              fontSize: 26,
              letterSpacing: "0.04em",
              color: paper,
              opacity: interpolate(sec, [SITE_AT, SITE_AT + 0.5], [0, 0.72], clamp),
            }}
          >
            {SITE}
          </div>
        ) : null}
      </div>
    </AbsoluteFill>
  )
}
