import { AbsoluteFill, Easing, interpolate, useVideoConfig } from "remotion"
import { monoFamily, sansFamily } from "./fonts"
import { Mark } from "./mark"
import { LightMask } from "./stage-view"
import type { LightShape } from "./stage"
import { lime, mute, paper } from "./theme"

// The intro and the outro are the only graphics-only scenes. They bookend the
// film with [LIGHT:alone] and catch only the edge of the pool, so the same light
// that lights the phone lights the title.

export const SUBTITLE = "Hark! The Harold Agents Sing"
export const CTA_HANDLE = "codenamegary/harold"
export const SITE = "harold.codenamegary.com"

const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const
const ease = Easing.bezier(0.16, 1, 0.3, 1)

const rise = (sec: number, from: number, duration = 0.6): number =>
  interpolate(sec, [from, from + duration], [0, 1], { ...clamp, easing: ease })

/** The GitHub mark, 24x24. The script's CTA is `:github logo: codenamegary/harold`. */
const GithubMark: React.FC<{ size: number }> = ({ size }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
    <path d="M12 .5C5.73.5.5 5.73.5 12c0 5.08 3.29 9.39 7.86 10.91.58.11.79-.25.79-.56 0-.28-.01-1.02-.02-2-3.2.7-3.88-1.54-3.88-1.54-.53-1.34-1.29-1.7-1.29-1.7-1.05-.72.08-.71.08-.71 1.17.08 1.78 1.2 1.78 1.2 1.03 1.77 2.7 1.26 3.36.96.1-.75.4-1.26.73-1.55-2.55-.29-5.23-1.28-5.23-5.68 0-1.26.45-2.29 1.19-3.09-.12-.29-.52-1.46.11-3.05 0 0 .97-.31 3.18 1.18a11.04 11.04 0 0 1 2.9-.39c.98 0 1.97.13 2.9.39 2.2-1.49 3.17-1.18 3.17-1.18.63 1.59.23 2.76.11 3.05.74.8 1.19 1.83 1.19 3.09 0 4.41-2.69 5.38-5.25 5.67.41.36.78 1.06.78 2.14 0 1.55-.01 2.8-.01 3.18 0 .31.21.68.8.56A11.5 11.5 0 0 0 23.5 12C23.5 5.73 18.27.5 12 .5z" />
  </svg>
)

export const Slide: React.FC<{
  variant: "intro" | "outro"
  /** Render seconds since the slide's own start. */
  sec: number
  opacity: number
  light: LightShape
}> = ({ variant, sec, opacity, light }) => {
  const { width, height } = useVideoConfig()
  const markIn = rise(sec, 0.1)
  const subtitleIn = rise(sec, 0.3)
  const ctaIn = rise(sec, 0.5)
  const siteIn = rise(sec, 0.7)
  return (
    <AbsoluteFill style={{ opacity }}>
      <div
        style={{
          position: "absolute",
          left: width * 0.13,
          top: height * 0.24,
          width: width * 0.54,
          display: "flex",
          flexDirection: "column",
          alignItems: "flex-start",
        }}
      >
        <div style={{ opacity: markIn, scale: `${0.92 + markIn * 0.08}`, color: lime }}>
          <Mark size={96} />
        </div>
        <div
          style={{
            marginTop: 44,
            fontFamily: sansFamily,
            fontSize: 74,
            fontWeight: 600,
            lineHeight: 0.98,
            letterSpacing: "-0.045em",
            color: paper,
            textWrap: "balance",
            opacity: subtitleIn,
            translate: `0px ${(1 - subtitleIn) * 18}px`,
          }}
        >
          {SUBTITLE}
        </div>
        <div
          style={{
            marginTop: 38,
            display: "flex",
            alignItems: "center",
            gap: 16,
            opacity: ctaIn,
            translate: `0px ${(1 - ctaIn) * 12}px`,
            color: paper,
          }}
        >
          <GithubMark size={34} />
          <div style={{ fontFamily: monoFamily, fontSize: 30, letterSpacing: "0.01em" }}>
            {CTA_HANDLE}
          </div>
        </div>
        {variant === "outro" ? (
          <div
            style={{
              marginTop: 26,
              fontFamily: monoFamily,
              fontSize: 22,
              letterSpacing: "0.06em",
              color: mute,
              opacity: siteIn,
            }}
          >
            {SITE}
          </div>
        ) : null}
      </div>
      <LightMask shape={light} />
    </AbsoluteFill>
  )
}
