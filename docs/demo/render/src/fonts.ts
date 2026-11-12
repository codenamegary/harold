import { useEffect, useState } from "react"
import { continueRender, delayRender, staticFile } from "remotion"

// Geist and Geist Mono, both OFL, copied into public/fonts from
// docs/store-android/src/fonts. They are variable fonts (STAT / HVAR present),
// so one file covers the whole weight range.
const SANS = "Geist"
const MONO = "Geist Mono"

const FACES = [
  { family: SANS, file: "fonts/geist-latin.woff2" },
  { family: MONO, file: "fonts/geist-mono-latin.woff2" },
]

export const sansFamily = `"${SANS}", system-ui, sans-serif`
export const monoFamily = `"${MONO}", ui-monospace, monospace`

// The type scale. Large display type is tracked tight; machine-readable text is
// always mono and never tracked. One lime accent does the rest of the colour.
export const typeScale = {
  display: 128,
  headline: 96,
  title: 68,
  lead: 54,
  body: 30,
  label: 20,
  mono: 40,
  monoSmall: 24,
} as const

/**
 * Loads both faces before the first frame renders. Mount once, inside the
 * composition.
 */
export const FontLoader: React.FC = () => {
  const [handle] = useState(() => delayRender("Loading Geist"))
  useEffect(() => {
    const loading = FACES.map(async (face) => {
      const font = new FontFace(face.family, `url("${staticFile(face.file)}") format("woff2")`, {
        weight: "100 900",
        display: "block",
      })
      await font.load()
      document.fonts.add(font)
    })
    Promise.all(loading)
      .then(() => continueRender(handle))
      .catch((error: unknown) => {
        console.error(error)
        continueRender(handle)
      })
  }, [handle])
  return null
}
